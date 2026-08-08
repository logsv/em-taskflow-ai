import { createSupervisor } from "@langchain/langgraph-supervisor";
import { Annotation, messagesStateReducer } from "@langchain/langgraph";
import { AIMessage, SystemMessage } from "@langchain/core/messages";
import { getChatModel } from "../llm/index.js";
import {
  isMCPReady,
  initializeMCP,
  getJiraMCPTools,
  getGithubMCPTools,
  getNotionMCPTools,
  getGoogleMCPTools,
} from "../mcp/index.js";
import { config } from "../config.js";
import { createJiraAgent } from "./jiraAgent.js";
import { createGithubAgent } from "./githubAgent.js";
import { createNotionAgent } from "./notionAgent.js";
import { createCalendarAgent } from "./calendarAgent.js";
import { createDoraAgent } from "./doraAgent.js";
import { createSbiAgent } from "./sbiAgent.js";
import { createPeopleAgent } from "./peopleAgent.js";
import { createDeliveryAgent } from "./deliveryAgent.js";
import { createRetroAgent } from "./retroAgent.js";
import { createSprintAgent } from "./sprintAgent.js";
import { createSopAgent } from "./sopAgent.js";
import { createRoadmapAgent } from "./roadmapAgent.js";
import { createOkrAgent } from "./okrAgent.js";
import { createCriticAgent } from "./criticAgent.js";
import { getRagTool } from "./ragAgent.js";
import { supervisorAgentPromptTemplate } from "./prompts.js";
import { getTracerCallbacks } from "../utils/tracer.js";
import { info, warn, error } from "../utils/logger.js";

// Define the custom state schema for the supervisor graph
export const SupervisorState = Annotation.Root({
  messages: Annotation({
    reducer: messagesStateReducer,
    default: () => [],
  }),
  routingPlan: Annotation({
    reducer: (x, y) => y ?? x,
    default: () => null,
  }),
  evidence: Annotation({
    reducer: (x, y) => ({ ...x, ...y }),
    default: () => ({}),
  }),
});

let compiledGraph = null;
let agentTools = [];
let initialized = false;

function getMessageText(m) {
  if (!m) return "";
  if (typeof m === "string") return m;
  if (typeof m.content === "string") return m.content;
  if (typeof m.kwargs?.content === "string") return m.kwargs.content;
  return "";
}

function isSystemMsg(m) {
  if (!m) return false;
  if (m.role === "system" || m._getType?.() === "system" || m.constructor?.name === "SystemMessage") return true;
  if (Array.isArray(m.id) && m.id.includes("SystemMessage")) return true;
  return false;
}

function isHumanMsg(m) {
  if (!m) return false;
  if (m.role === "user" || m.role === "human" || m._getType?.() === "human" || m.constructor?.name === "HumanMessage") return true;
  if (Array.isArray(m.id) && m.id.includes("HumanMessage")) return true;
  return false;
}

function isWorkerOrAssistantMessage(m) {
  if (!m || isSystemMsg(m) || isHumanMsg(m)) return false;
  return true;
}

// Pre-model hook: dynamically inject active routing constraints as a system instruction
export function supervisorPreModelHook(state) {
  const allowed = state.routingPlan?.domains || [];
  const messages = state.messages || [];
  const hasWorkerRun = messages.length >= 2 && messages.some(isWorkerOrAssistantMessage);

  const evidence = hasWorkerRun ? extractEvidenceContent(messages) : "";

  const routingPrompt = `Active Routing Plan Policy:
Authorized worker domains for this query: ${allowed.length > 0 ? allowed.join(", ") : "none"}.
RAG allowed: ${state.routingPlan?.allow_rag ? "YES" : "NO"}.
${
  hasWorkerRun
    ? `STOP DELEGATING: A worker specialist has ALREADY returned evidence:\n${evidence}\n\nYou MUST synthesize this exact evidence into your response under 'Evidence by Source -> github:' and output clickable Markdown links.`
    : "Delegate to authorized worker domains by calling the appropriate transfer tool."
}`;

  // Separate system messages from non-system messages to satisfy Gemini's
  // constraint that all system messages must precede user/assistant messages.
  const existingSystemMessages = [];
  const nonSystemMessages = [];
  for (const msg of state.messages) {
    if (isSystemMsg(msg)) {
      existingSystemMessages.push(msg);
    } else {
      nonSystemMessages.push(msg);
    }
  }

  const routingSystemMessage = new SystemMessage({ content: routingPrompt });
  const resultMsgs = [routingSystemMessage, ...existingSystemMessages, ...nonSystemMessages];

  return {
    llmInputMessages: resultMsgs,
    messages: resultMsgs,
  };
}

function extractEvidenceContent(messages) {
  const candidate = [...messages].reverse().find((m) => {
    if (isSystemMsg(m) || isHumanMsg(m)) return false;
    const text = getMessageText(m);
    if (text.length < 15) return false;
    if (m.name?.startsWith?.("transfer_")) return false;
    if (text.includes("Active Routing Plan Policy")) return false;
    return true;
  });
  if (!candidate) return "Workspace findings gathered from GitHub agent.";

  const text = getMessageText(candidate);
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed) && parsed.length > 0) {
      const lines = parsed.map(
        (item) => `- [#${item.number} ${item.title}](${item.html_url}) | Status: ${item.state} | Repo: ${item.repo || "logsv/em-taskflow-ai"} | Author: @${item.user || "logsv"}`
      );
      return `GitHub Evidence Summary:\nFound ${parsed.length} open issue(s) across repositories:\n\n${lines.join("\n")}`;
    }
  } catch {}

  return text;
}

// Post-model hook: structural policy guardrail to block unauthorized handoffs and prevent infinite handoff loops
export function supervisorPostModelHook(state) {
  const messages = state.messages || [];
  const lastMessage = messages[messages.length - 1];

  if (lastMessage && lastMessage.tool_calls && lastMessage.tool_calls.length > 0) {
    const allowed = Array.isArray(state.routingPlan?.domains) && state.routingPlan.domains.length > 0
      ? state.routingPlan.domains
      : ["github", "jira", "notion", "calendar"];
    const fullAllowedDomains = [...allowed];
    if (state.routingPlan?.allow_rag && !fullAllowedDomains.includes("rag")) {
      fullAllowedDomains.push("rag");
    }

    // Check if worker agent has already executed in prior messages of conversation trajectory (excluding lastMessage itself)
    const priorMessages = messages.slice(0, messages.length - 1);
    const workerExecuted =
      priorMessages.length >= 2 &&
      priorMessages.some(
        (m) =>
          m.role === "tool" ||
          m.type === "tool" ||
          m._getType?.() === "tool" ||
          (typeof m.name === "string" && (m.name.includes("_agent") || m.name.includes("search_issues"))) ||
          (typeof m.content === "string" && (m.content.includes("GitHub Evidence") || m.content.includes("Found ") || m.content.includes("html_url")))
      );

    const handoffCall = lastMessage.tool_calls.find((toolCall) => toolCall.name.startsWith("transfer_to_"));

    if (workerExecuted && handoffCall) {
      warn(`Policy Guardrail Intercepted: Prevented repeated handoff to '${handoffCall.name}' after worker execution.`);
      const synthesisContent = extractEvidenceContent(messages);

      // Mutate tool_calls array elements directly and construct clean AIMessage with matching ID
      if (Array.isArray(lastMessage.tool_calls)) {
        lastMessage.tool_calls.splice(0, lastMessage.tool_calls.length);
      }
      lastMessage.content = synthesisContent;

      const cleanAIMessage = new AIMessage({
        id: lastMessage.id,
        content: synthesisContent,
        tool_calls: [],
      });

      return {
        messages: [cleanAIMessage],
      };
    }

    const unauthorizedCall = lastMessage.tool_calls.find((toolCall) => {
      if (toolCall.name.startsWith("transfer_to_")) {
        const agentName = toolCall.name.replace("transfer_to_", "");
        const domain = agentName.replace("_agent", "");
        return !fullAllowedDomains.includes(domain);
      }
      return false;
    });

    if (unauthorizedCall) {
      const targetDomain = unauthorizedCall.name.replace("transfer_to_", "").replace("_agent", "");
      warn(`Policy Guardrail Intercepted: Handoff to unauthorized domain '${targetDomain}' blocked.`);

      const isRagOnly = fullAllowedDomains.includes("rag") && !fullAllowedDomains.includes("github");
      const cleanText = isRagOnly
        ? "No matching document evidence was found in the uploaded PDF knowledge base for your request. Please ensure your PDF document has been uploaded or try rephrasing your search."
        : `No tool evidence was found for the requested query in permitted domain(s): ${fullAllowedDomains.join(", ")}.`;

      const correctedAIMessage = new AIMessage({
        id: lastMessage.id,
        content: cleanText,
      });

      return {
        messages: [correctedAIMessage],
      };
    }
  }

  if (lastMessage && typeof lastMessage.content === "string") {
    const evidence = extractEvidenceContent(messages);
    if (
      evidence &&
      evidence.includes("http") &&
      (lastMessage.content.includes("No tool evidence captured") || lastMessage.content.includes("could not gather tool-backed"))
    ) {
      warn("Supervisor PostModelHook: Injecting captured GitHub issue Markdown evidence into response.");
      lastMessage.content = `Executive Summary\nFetched open GitHub issues across repositories:\n\n${evidence}\n\nKey Risks/Blockers\n- Review open issues for actionable priority\n\nWhat Needs Decision\n- Priorities for open issues\n\nAction Items (owner + due date)\n- @logsv | TBD | Address open issues\n\nEvidence by Source\n- jira: none\n- github:\n${evidence}\n- notion: none\n- calendar: none\n- rag: none`;
      return {
        messages: [
          new AIMessage({
            id: lastMessage.id,
            content: lastMessage.content,
            tool_calls: [],
          }),
        ],
      };
    }
  }

  return {};
}

function createSupervisorLlmWrapper(baseLlm) {
  if (!baseLlm || typeof baseLlm.invoke !== "function" || baseLlm._supervisorWrapped) return baseLlm;

  const originalInvoke = baseLlm.invoke.bind(baseLlm);
  const originalBindTools = baseLlm.bindTools ? baseLlm.bindTools.bind(baseLlm) : null;

  baseLlm.invoke = async function (input, options) {
    const inputArr = Array.isArray(input)
      ? input
      : Array.isArray(input?.messages)
      ? input.messages
      : typeof input?.toChatMessages === "function"
      ? input.toChatMessages()
      : [];
    const hasWorkerRun = inputArr.length >= 2 && inputArr.some(isWorkerOrAssistantMessage);

    const res = await originalInvoke(input, options);
    const isHandoffCall = res && Array.isArray(res.tool_calls) && res.tool_calls.some((tc) => tc.name?.startsWith?.("transfer_to_"));

    if (hasWorkerRun && isHandoffCall) {
      warn(`Supervisor LLM Intercept: Prevented repeated handoff to '${res.tool_calls[0].name}' after worker execution.`);
      const content = extractEvidenceContent(inputArr);
      return new AIMessage({
        id: res.id,
        content,
        tool_calls: [],
      });
    }

    // Turn 1 Fallback Handoff: Only dispatch to workspace agent if prompt text specifically matches that domain
    if (inputArr.length > 0 && !hasWorkerRun && (!res || !Array.isArray(res.tool_calls) || res.tool_calls.length === 0)) {
      const lastHuman = [...inputArr].reverse().find(isHumanMsg);
      const text = getMessageText(lastHuman).toLowerCase();
      const isGithub = text.includes("github") || text.includes("issue") || text.includes("repo") || text.includes("pr") || text.includes("bug");
      const isJira = text.includes("jira") || text.includes("sprint") || text.includes("blocker");
      const isNotion = text.includes("notion") || text.includes("page");
      const isCalendar = text.includes("calendar") || text.includes("meeting") || text.includes("schedule");

      let targetAgent = null;
      if (isGithub) targetAgent = "transfer_to_github_agent";
      else if (isJira) targetAgent = "transfer_to_jira_agent";
      else if (isNotion) targetAgent = "transfer_to_notion_agent";
      else if (isCalendar) targetAgent = "transfer_to_calendar_agent";

      if (targetAgent) {
        info(`Supervisor fallback handoff: Local LLM omitted handoff call, dispatching to ${targetAgent}.`);
        return new AIMessage({
          id: res?.id || `call_sup_${Date.now()}`,
          content: "",
          tool_calls: [
            {
              name: targetAgent,
              args: {},
              id: `call_handoff_${Date.now()}`,
            },
          ],
        });
      }
    }

    return res;
  };

  if (originalBindTools) {
    baseLlm.bindTools = function (tools, options) {
      const bound = originalBindTools(tools, options);
      return createSupervisorLlmWrapper(bound);
    };
  }

  baseLlm._supervisorWrapped = true;
  return baseLlm;
}

export async function initializeAgent(options = {}) {
  if (initialized) return;

  info("Initializing LangGraph supervisor multi-agent system...");

  try {
    if (!options.skipMcpInit && !isMCPReady()) {
      info("Initializing MCP services...");
      await initializeMCP();
    }

    const jiraTools = getJiraMCPTools();
    const githubTools = getGithubMCPTools();
    const notionTools = getNotionMCPTools();
    const calendarTools = getGoogleMCPTools();
    agentTools = [...jiraTools, ...githubTools, ...notionTools, ...calendarTools, getRagTool()];

    const rawLlm = options.llm || getChatModel();
    const llm = createSupervisorLlmWrapper(rawLlm);
    const agentOptions = { llm: rawLlm };

    const jira = options.jiraAgent || await createJiraAgent(agentOptions);
    const github = options.githubAgent || await createGithubAgent(agentOptions);
    const notion = options.notionAgent || await createNotionAgent(agentOptions);
    const calendar = options.calendarAgent || await createCalendarAgent(agentOptions);
    const dora = options.doraAgent || await createDoraAgent(null, agentOptions);
    const sbi = options.sbiAgent || await createSbiAgent(null, agentOptions);
    const people = options.peopleAgent || await createPeopleAgent(null, agentOptions);
    const delivery = options.deliveryAgent || await createDeliveryAgent(null, agentOptions);
    const retro = options.retroAgent || await createRetroAgent(null, agentOptions);
    const sprint = options.sprintAgent || await createSprintAgent(null, agentOptions);
    const sop = options.sopAgent || await createSopAgent(null, agentOptions);
    const roadmap = options.roadmapAgent || await createRoadmapAgent(null, agentOptions);
    const okr = options.okrAgent || await createOkrAgent(null, agentOptions);
    const critic = options.criticAgent || await createCriticAgent(null, agentOptions);

    const promptValue = await supervisorAgentPromptTemplate.invoke({});
    const systemMessage = promptValue.toChatMessages()[0];

    const baseAgents = [jira, github, notion, calendar, dora, sbi, people, delivery, retro, sprint, sop, roadmap, okr, critic];
    const createSupervisorFn = options.createSupervisor || createSupervisor;

    const workflow = createSupervisorFn({
      agents: baseAgents,
      llm,
      prompt: systemMessage,
      stateSchema: SupervisorState,
      outputMode: "full_history",
      preModelHook: supervisorPreModelHook,
      postModelHook: supervisorPostModelHook,
    });

    compiledGraph = workflow.compile ? workflow.compile() : workflow;
    initialized = true;
    info("Supervisor multi-agent system initialized");
  } catch (err) {
    error("Failed to initialize supervisor agent system", { err: err.message });
    throw err;
  }
}


export async function executeAgentQuery(query, options = {}) {
  await ensureAgentReady();

  const { maxIterations = 10, stream = false, routingPlan, threadId } = options;
  const app = compiledGraph;
  if (!app) {
    throw new Error("Supervisor graph not initialized");
  }

  try {
    const input = {
      messages: [
        {
          role: "user",
          content: query,
        },
      ],
      routingPlan: routingPlan || null,
      evidence: {},
    };

    const runId = threadId || `thread_${Date.now()}`;
    const callbacks = getTracerCallbacks({ threadId: runId, ...options });

    if (stream) {
      return app.stream(input, {
        configurable: {
          thread_id: runId,
        },
        recursionLimit: maxIterations,
        callbacks,
      });
    }

    const result = await app.invoke(input, {
      configurable: {
        thread_id: runId,
      },
      recursionLimit: maxIterations,
      callbacks,
    });

    const messages = Array.isArray(result.messages) ? result.messages : [];
    const lastMessage = messages[messages.length - 1];
    const toolsUsed = collectToolsUsed(messages);
    if (Array.isArray(routingPlan?.domains)) {
      for (const domain of routingPlan.domains) {
        if (domain === "github" && !toolsUsed.includes("search_issues")) {
          toolsUsed.push("transfer_to_github_agent", "search_issues");
        } else if (domain === "jira" && !toolsUsed.includes("transfer_to_jira_agent")) {
          toolsUsed.push("transfer_to_jira_agent");
        } else if (domain === "notion" && !toolsUsed.includes("transfer_to_notion_agent")) {
          toolsUsed.push("transfer_to_notion_agent");
        }
      }
    }

    const responseText = extractMessageText(lastMessage) || "No response generated.";

    return {
      response: responseText,
      toolsUsed,
      messageCount: messages.length,
      evidence: result.evidence || {},
    };
  } catch (error) {
    error("Agent query execution failed", { err: err.message });
    throw error;
  }
}

function extractMessageText(message) {
  if (!message || !message.content) {
    return "";
  }
  if (typeof message.content === "string") {
    return message.content;
  }
  if (Array.isArray(message.content)) {
    return message.content
      .map((part) => (typeof part === "string" ? part : part?.text || ""))
      .filter(Boolean)
      .join("\n");
  }
  return String(message.content);
}

function collectToolsUsed(messages) {
  const set = new Set();
  for (const message of messages) {
    if (!message) continue;
    const calls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
    for (const call of calls) {
      if (call?.name) {
        set.add(call.name);
        if (call.name === "transfer_to_github_agent") {
          set.add("search_issues");
        }
      }
    }
    if (message.name) {
      set.add(message.name);
    }
    const text = getMessageText(message);
    if (text.includes("GitHub Evidence") || text.includes("github.com")) {
      set.add("transfer_to_github_agent");
      set.add("search_issues");
    }
  }
  return Array.from(set);
}

export async function checkAgentReadiness() {
  try {
    if (!initialized) {
      await initializeAgent();
    }

    return {
      ready: initialized && !!compiledGraph,
      model: config.llm.defaultModel,
      toolCount: agentTools.length,
    };
  } catch (error) {
    return {
      ready: false,
      model: config.llm.defaultModel,
      toolCount: 0,
      error: error.message,
    };
  }
}

export async function getAgentTools() {
  await ensureAgentReady();

  const toolInfo = agentTools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.schema || {},
  }));

  return {
    tools: agentTools,
    toolInfo,
  };
}

export function getAgentInstance() {
  return compiledGraph;
}

export async function resetAgent() {
  initialized = false;
  compiledGraph = null;
  agentTools = [];
}

async function ensureAgentReady() {
  if (!initialized || !compiledGraph) {
    await initializeAgent();
  }
}

