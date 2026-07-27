import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { HumanMessage, SystemMessage, AIMessage } from "@langchain/core/messages";
import { getChatModel } from "../llm/index.js";
import { githubAgentPromptTemplate } from "./prompts.js";
import { getRagTool } from "./ragAgent.js";
import { getGithubMCPTools } from "../mcp/index.js";

export function githubPreModelHook(state) {
  const messages = state.messages || [];
  const lastMsg = messages[messages.length - 1];

  const hasToolMessage = messages.some(
    (m) =>
      (m._getType?.() === "tool" ||
        m.constructor?.name === "ToolMessage" ||
        m.role === "tool" ||
        m.role === "function") &&
      m.name !== "transfer_to_github_agent" &&
      !m.name?.startsWith?.("transfer_")
  );

  // If a tool has executed (or returned error/data), force a pure text summary prompt and terminate tool calls
  if (hasToolMessage) {
    const summaryDirective = new HumanMessage({
      content: `The GitHub tool search returned the following live issue data:\n${typeof lastMsg?.content === "string" ? lastMsg.content.slice(0, 4000) : JSON.stringify(lastMsg?.content || "")}\n\nTask: Provide a detailed summary of every GitHub issue listed above. You MUST include issue numbers, titles, status, and direct clickable Markdown links (format: [#<number> <title>](<html_url>)). DO NOT invoke any tool calls.`
    });
    return {
      llmInputMessages: [
        new SystemMessage({
          content: "You are a GitHub issue reporting specialist. Synthesize the tool evidence into a structured, clear summary containing exact issue titles, status, and clickable Markdown links."
        }),
        summaryDirective,
      ],
    };
  }

  const userMsg = [...messages].reverse().find(
    (m) =>
      (m._getType?.() === "human" ||
        m.getType?.() === "human" ||
        m.constructor?.name === "HumanMessage" ||
        m.role === "user") &&
      typeof m.content === "string" &&
      m.content.trim().length > 0
  );
  const userQuery = userMsg ? userMsg.content : "Fetch all open GitHub issues across repositories";

  // Parse GitHub issue URL, repo, or issue number if provided in user prompt
  const issueUrlMatch = userQuery.match(/github\.com\/([^\/]+)\/([^\/]+)\/issues\/(\d+)/i);
  const issueNumMatch = userQuery.match(/(?:issue|#)\s*(\d+)/i);

  let queryParam = "is:issue is:open user:logsv";

  if (issueUrlMatch) {
    queryParam = `is:issue ${issueUrlMatch[3]}`;
  } else if (issueNumMatch) {
    queryParam = `is:issue ${issueNumMatch[1]}`;
  }

  const workerPrompt = new HumanMessage({
    content: `${userQuery}\n\n[DIRECTIVE: Call tool 'search_issues' with {"query": "${queryParam}"} right now to fetch GitHub evidence.]`
  });

  const cleanedMessages = messages.filter((m) => m._getType?.() !== "system");
  const lastIsHuman =
    lastMsg?._getType?.() === "human" ||
    lastMsg?.constructor?.name === "HumanMessage" ||
    lastMsg?.role === "user";

  if (lastIsHuman && cleanedMessages.length > 0) {
    cleanedMessages[cleanedMessages.length - 1] = workerPrompt;
  } else {
    cleanedMessages.push(workerPrompt);
  }

  return {
    llmInputMessages: cleanedMessages,
  };
}

function createGithubLlmWrapper(baseLlm) {
  const wrapper = Object.create(baseLlm);
  wrapper.bindTools = function (tools, options) {
    const bound = baseLlm.bindTools(tools, options);
    const boundWrapper = Object.create(bound);
    boundWrapper.invoke = async function (input, options) {
      const inputArr = Array.isArray(input) ? input : [];
      const res = await bound.invoke(input, options);
      const hasGithubToolMsg =
        inputArr.length >= 2 ||
        inputArr.some(
          (m) =>
            m.role === "tool" ||
            m.type === "tool" ||
            m._getType?.() === "tool" ||
            m.constructor?.name === "ToolMessage" ||
            (typeof m.name === "string" && !m.name.startsWith("transfer_")) ||
            (typeof m.content === "string" &&
              (m.content.includes("search_issues") ||
                m.content.includes("evidence") ||
                m.content.includes("Executive Summary")))
        );

      // If tool evidence was already supplied, force pure text summary and strip any unexpected tool calls
      if (hasGithubToolMsg) {
        if (res.tool_calls && res.tool_calls.length > 0) {
          console.log("🛡️ GitHub Agent: Stripping tool calls from summary turn response.");
          return new AIMessage({
            content: typeof res.content === "string" && res.content.trim().length > 0 ? res.content : "Fetched GitHub issues evidence summary.",
            tool_calls: [],
          });
        }
        return res;
      }

      // Only fallback on turn 1 if local LLM omitted a tool call
      if (!hasGithubToolMsg && (!res || !Array.isArray(res.tool_calls) || res.tool_calls.length === 0)) {
        const lastHumanMsg = [...inputArr].reverse().find(
          (m) =>
            m._getType?.() === "human" ||
            m.constructor?.name === "HumanMessage" ||
            m.role === "user"
        );
        const text = typeof lastHumanMsg?.content === "string" ? lastHumanMsg.content : "";
        const issueUrlMatch = text.match(/github\.com\/([^\/]+)\/([^\/]+)\/issues\/(\d+)/i);
        const issueNumMatch = text.match(/(?:issue|#)\s*(\d+)/i);
        let queryParam = "is:issue is:open user:logsv";
        if (issueUrlMatch) {
          queryParam = `is:issue ${issueUrlMatch[3]} user:logsv`;
        } else if (issueNumMatch) {
          queryParam = `is:issue ${issueNumMatch[1]} user:logsv`;
        }
        console.log(`⚡ [GITHUB AGENT FALLBACK DISPATCH]: Injecting deterministic search_issues call with query "${queryParam}"`);
        return new AIMessage({
          content: "",
          tool_calls: [
            {
              name: "search_issues",
              args: { query: queryParam },
              id: `call_fallback_${Date.now()}`
            }
          ]
        });
      }

      return res;
    };
    return boundWrapper;
  };
  return wrapper;
}

export async function createGithubAgent() {
  const baseLlm = getChatModel();
  const llm = createGithubLlmWrapper(baseLlm);
  const allGithubTools = getGithubMCPTools();

  const primaryToolNames = new Set(["search_issues", "issue_read"]);
  let githubTools = allGithubTools.filter((t) => primaryToolNames.has(t.name));
  if (githubTools.length === 0) {
    githubTools = allGithubTools;
  }

  const prompt = `You are a specialized GitHub data retrieval agent.
ROUTING & EXECUTION RULES:
- Step 1: Call 'search_issues' to fetch live workspace issues and evidence.
- Step 2: Summarize findings concisely for the supervisor.`;

  return createReactAgent({
    llm,
    tools: githubTools.length > 0 ? githubTools : [getRagTool()],
    name: "github_agent",
    prompt,
    preModelHook: githubPreModelHook,
  });
}

