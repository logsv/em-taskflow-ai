import { DynamicTool } from "@langchain/core/tools";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { getChatModel } from "../llm/index.js";
import ragService from "../rag/index.js";
import { ragAgentPromptTemplate } from "./prompts.js";

export async function createRagAgent() {
  const llm = getChatModel();

  const ragTool = new DynamicTool({
    name: "rag_db_query_retriever",
    description:
      "Use this tool to search the document knowledge base. It converts the user question into a focused database query using an LLM, retrieves the most relevant document chunks, and returns them as JSON.",
    func: async (input) => {
      const query = typeof input === "string" ? input : JSON.stringify(input);
      const result = await ragService.searchRelevantChunks(query, 5);
      return JSON.stringify(result);
    },
  });

  const promptValue = await ragAgentPromptTemplate.invoke({});
  const systemMessage = promptValue.toChatMessages()[0];

  return createReactAgent({
    llm,
    tools: [ragTool],
    name: "rag_agent",
    prompt: systemMessage,
  });
}

