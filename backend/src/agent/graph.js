import { createSupervisor } from "@langchain/langgraph-supervisor";
import { Annotation, messagesStateReducer } from "@langchain/langgraph";
import { AIMessage, SystemMessage } from "@langchain/core/messages";
import { getChatModel, ensureLLMReady } from "../llm/index.js";
import {
  isMCPReady,
  initializeMCP,
  getJiraMCPTools,
  getGithubMCPTools,
  getNotionMCPTools,
  getGoogleMCPTools,
} from "../mcp/index.js";
import { config } from "../config.js";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import ragService from "../rag/index.js";
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
import { supervisorAgentPromptTemplate } from "./prompts.js";

export function getRagTool() {
  return new DynamicStructuredTool({
    name: "rag_search",
    description: "Search local PDF knowledge base documents for relevant context, rubrics, and guidelines.",
    schema: z.object({
      query: z.string().describe("Search query for PDF chunks"),
    }),
    func: async ({ query }) => {
      const results = await ragService.searchRelevantChunks(query);
      return JSON.stringify(results);
    },
  });
}
import { getTracerCallbacks } from "../utils/tracer.js";
import { info, warn, error as logError } from "../utils/logger.js";

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
  contextEntities: Annotation({
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

export function isWorkerOrAssistantMessage(m) {
  if (!m) return false;
  if (isSystemMsg(m) || isHumanMsg(m)) return false;
  const msgType = typeof m._getType === "function" ? m._getType() : m.type || "";
  const role = m.role || "";
  const isAi = msgType === "ai" || role === "assistant" || m.constructor?.name === "AIMessage";
  const isTool = msgType === "tool" || role === "tool" || (typeof m.name === "string" && (m.name.includes("_agent") || m.name.includes("transfer_")));
  return isAi || isTool;
}

/**
 * Slices the messages array to isolate the execution trajectory of the active turn
 * (all messages occurring after the latest HumanMessage).
 */
export function getCurrentTurnMessages(messages = []) {
  if (!Array.isArray(messages) || messages.length === 0) return [];
  let lastHumanIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (isHumanMsg(messages[i])) {
      lastHumanIdx = i;
      break;
    }
  }
  return lastHumanIdx >= 0 ? messages.slice(lastHumanIdx + 1) : messages;
}

// Pre-model hook: dynamically inject active routing constraints as a system instruction
export function supervisorPreModelHook(state) {
  const allowed = state.routingPlan?.domains || [];
  const messages = state.messages || [];
  const currentTurn = getCurrentTurnMessages(messages);
  const hasWorkerRun = currentTurn.length >= 1 && currentTurn.some(isWorkerOrAssistantMessage);

  const evidence = hasWorkerRun ? extractEvidenceContent(currentTurn) : "";

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
  const currentTurn = getCurrentTurnMessages(messages);
  const targetMessages = currentTurn.length > 0 ? currentTurn : messages;
  const candidate = [...targetMessages].reverse().find((m) => {
    if (isSystemMsg(m) || isHumanMsg(m)) return false;
    const text = getMessageText(m);
    if (text.length < 15) return false;
    if (m.name?.startsWith?.("transfer_")) return false;
    if (text.includes("Active Routing Plan Policy")) return false;
    return true;
  });
  if (!candidate) return "Workspace findings gathered from domain specialist.";

  const text = getMessageText(candidate);
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed) && parsed.length > 0) {
      const lines = parsed.map(
        (item) => `- [#${item.number || item.id || '1'} ${item.title || item.summary || 'Item'}](${item.html_url || '#'}) | Status: ${item.state || item.status || 'open'}`
      );
      return `Domain Evidence Summary:\nFound ${parsed.length} item(s):\n\n${lines.join("\n")}`;
    } else if (parsed && typeof parsed === "object") {
      const target = parsed.data || parsed;
      const itemsList = target.github_issues || target.active_issues || target.blocked_prs || [];
      const lines = Array.isArray(itemsList) && itemsList.length > 0
        ? itemsList.map(
            (item) => `- [#${item.number || item.id || '1'} ${item.title || item.summary || 'Item'}](${item.html_url || '#'}) | Status: ${item.state || item.status || 'open'}`
          )
        : [];
      const summaryText = target.summary || parsed.summary || "";
      if (summaryText) {
        if (lines.length > 0 && !summaryText.includes("GitHub Issues")) {
          return `${summaryText}\n\nGitHub Open Issues:\n${lines.join("\n")}`;
        }
        return summaryText;
      }
      if (lines.length > 0) {
        return `GitHub Evidence Summary (${lines.length} open issue(s)):\n${lines.join("\n")}`;
      }
    }
  } catch {}

  return text;
}

// Post-model hook: structural policy guardrail to block unauthorized handoffs and prevent infinite handoff loops
export function supervisorPostModelHook(state) {
  const messages = state.messages || [];
  const currentTurn = getCurrentTurnMessages(messages);
  const lastMessage = messages[messages.length - 1];

  if (lastMessage && lastMessage.tool_calls && lastMessage.tool_calls.length > 0) {
    const allowed = Array.isArray(state.routingPlan?.domains) && state.routingPlan.domains.length > 0
      ? state.routingPlan.domains
      : ["dora", "delivery", "sbi", "people", "sprint", "retro", "roadmap", "okr", "sop", "critic"];
    const fullAllowedDomains = [...allowed];
    if (state.routingPlan?.allow_rag && !fullAllowedDomains.includes("rag")) {
      fullAllowedDomains.push("rag");
    }

    // Check if worker agent has already executed in prior messages of the CURRENT turn (excluding lastMessage itself)
    const priorCurrentTurnMessages = currentTurn.slice(0, currentTurn.length - 1);
    const workerExecuted =
      priorCurrentTurnMessages.length >= 1 &&
      priorCurrentTurnMessages.some(
        (m) =>
          m.role === "tool" ||
          m.type === "tool" ||
          m._getType?.() === "tool" ||
          (typeof m.name === "string" && (m.name.includes("_agent") || m.name.includes("search_issues"))) ||
          (typeof m.content === "string" && (m.content.includes("Evidence Summary") || m.content.includes("Found ") || m.content.includes("html_url")))
      );

    const handoffCall = lastMessage.tool_calls.find((toolCall) => toolCall.name.startsWith("transfer_to_"));

    if (workerExecuted && handoffCall) {
      warn(`Policy Guardrail Intercepted: Prevented repeated handoff to '${handoffCall.name}' after worker execution.`);
      const synthesisContent = extractEvidenceContent(currentTurn);

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

      const isRagOnly = fullAllowedDomains.includes("rag") && !fullAllowedDomains.includes("delivery");
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
      (lastMessage.content.trim() === "" ||
        lastMessage.content.includes("No tool evidence captured") ||
        lastMessage.content.includes("could not gather tool-backed"))
    ) {
      warn("Supervisor PostModelHook: Preserving captured domain evidence in response.");
      lastMessage.content = evidence;
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
    const currentTurn = getCurrentTurnMessages(inputArr);
    const hasWorkerRun = currentTurn.length >= 1 && currentTurn.some(isWorkerOrAssistantMessage);

    const res = await originalInvoke(input, options);
    const isHandoffCall = res && Array.isArray(res.tool_calls) && res.tool_calls.some((tc) => tc.name?.startsWith?.("transfer_to_"));

    if (hasWorkerRun && isHandoffCall) {
      warn(`Supervisor LLM Intercept: Prevented repeated handoff to '${res.tool_calls[0].name}' after worker execution.`);
      const content = extractEvidenceContent(currentTurn);
      return new AIMessage({
        id: res.id,
        content,
        tool_calls: [],
      });
    }

    // Turn 1 Fallback Handoff: Dispatch to workspace agent if LLM omitted tool call in current turn
    if (inputArr.length > 0 && !hasWorkerRun && (!res || !Array.isArray(res.tool_calls) || res.tool_calls.length === 0)) {
      const lastHuman = [...inputArr].reverse().find(isHumanMsg);
      const text = getMessageText(lastHuman).toLowerCase();

      // Check for active routing plan policy in system message
      const systemMsg = inputArr.find(isSystemMsg);
      const systemText = getMessageText(systemMsg);
      const authorizedMatch = systemText.match(/Authorized worker domains for this query:\s*([a-z0-9_, ]+)/i);
      const authorizedDomains = authorizedMatch
        ? authorizedMatch[1].split(',').map((d) => d.trim().toLowerCase()).filter((d) => d !== 'none')
        : [];

      let targetAgent = null;
      if (authorizedDomains.length === 1 && authorizedDomains[0] !== 'rag') {
        const domain = authorizedDomains[0];
        targetAgent = `transfer_to_${domain}_agent`;
      } else {
        const isDora = text.includes("dora") || text.includes("lead time") || text.includes("mttr") || text.includes("deployment frequency");
        const isDelivery = text.includes("delivery") || text.includes("wip") || text.includes("throughput") || text.includes("cycle time");
        const isSbi = text.includes("sbi") || text.includes("feedback") || text.includes("coaching") || text.includes("situation");
        const isPeople = text.includes("people") || text.includes("career") || text.includes("burnout") || text.includes("1-on-1") || text.includes("1:1") || text.includes("agenda") || text.includes("promotion") || text.includes("growth");
        const isSprint = text.includes("sprint plan") || text.includes("velocity") || text.includes("capacity");
        const isRetro = text.includes("retro") || text.includes("retrospective") || text.includes("action items");
        const isSop = text.includes("sop") || text.includes("adr") || text.includes("compliance") || text.includes("guidelines");
        const isRoadmap = text.includes("roadmap") || text.includes("milestone") || text.includes("drift");
        const isOkr = text.includes("okr") || text.includes("kpi") || text.includes("key result");
        const isGithub = text.includes("github") || text.includes("issue") || text.includes("repo") || text.includes("pr") || text.includes("bug");
        const isJira = text.includes("jira") || text.includes("blocker");

        if (isDora) targetAgent = "transfer_to_dora_agent";
        else if (isDelivery || isGithub || isJira) targetAgent = "transfer_to_delivery_agent";
        else if (isSbi) targetAgent = "transfer_to_sbi_agent";
        else if (isPeople) targetAgent = "transfer_to_people_agent";
        else if (isSprint) targetAgent = "transfer_to_sprint_agent";
        else if (isRetro) targetAgent = "transfer_to_retro_agent";
        else if (isSop) targetAgent = "transfer_to_sop_agent";
        else if (isRoadmap) targetAgent = "transfer_to_roadmap_agent";
        else if (isOkr) targetAgent = "transfer_to_okr_agent";
      }

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

  if (!options.llm) {
    await ensureLLMReady();
  }

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

    const baseAgents = [dora, sbi, people, delivery, retro, sprint, sop, roadmap, okr, critic];

    const createSupervisorFn = options.createSupervisor || createSupervisor;

    const workflow = createSupervisorFn({
      agents: baseAgents,
      llm,
      prompt: systemMessage,
      stateSchema: SupervisorState,
      outputMode: options.outputMode || "last_message",
      ...(options.responseFormat ? { responseFormat: options.responseFormat } : {}),
      preModelHook: supervisorPreModelHook,
      postModelHook: supervisorPostModelHook,
    });

    const compiled = workflow && typeof workflow.compile === "function" ? workflow.compile() : workflow;
    compiledGraph = compiled;
    initialized = true;
    info("Supervisor multi-agent system initialized");
  } catch (err) {
    logError("Failed to initialize supervisor agent system", { err: err?.message });
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
    const historyMessages = Array.isArray(options.history)
      ? options.history.map((m) => ({
          role: m.role === 'assistant' ? 'assistant' : m.role === 'system' ? 'system' : 'user',
          content: typeof m.content === 'string' ? m.content : String(m.content || ''),
        }))
      : [];

    const input = {
      messages: [
        ...historyMessages,
        {
          role: "user",
          content: query,
        },
      ],
      routingPlan: routingPlan || null,
      evidence: {},
      contextEntities: options.entities || {},
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
    const currentTurn = getCurrentTurnMessages(messages);
    const candidateMessages = currentTurn.length > 0 ? currentTurn : messages;
    const lastMessage = messages[messages.length - 1];
    const toolsUsed = collectToolsUsed(candidateMessages);
    let responseText = "";
    for (let i = candidateMessages.length - 1; i >= 0; i--) {
      const msg = candidateMessages[i];
      if (!isWorkerOrAssistantMessage(msg)) {
        continue;
      }
      const txt = extractMessageText(msg);
      if (txt && txt.trim().length > 0 && txt.trim() !== String(query || "").trim() && !txt.includes("No response generated")) {
        responseText = txt.trim();
        break;
      }
    }

    if (!responseText) {
      const extractedEvidence = extractEvidenceContent(candidateMessages);
      if (extractedEvidence && !extractedEvidence.includes("Workspace findings gathered")) {
        responseText = extractedEvidence;
      } else {
        responseText = "No response generated.";
      }
    }

    return {
      response: responseText,
      toolsUsed,
      messageCount: messages.length,
      evidence: result.evidence || {},
    };
  } catch (err) {
    logError("Agent query execution failed", { err: err?.message });
    throw err;
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
      }
    }
    if (message.name) {
      set.add(message.name);
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
