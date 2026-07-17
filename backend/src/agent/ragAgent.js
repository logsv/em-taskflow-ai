import { DynamicTool } from "@langchain/core/tools";
import ragService from "../rag/index.js";

export function getRagTool() {
  return new DynamicTool({
    name: "rag_db_query_retriever",
    description:
      "Use this tool to search the document knowledge base. It converts the user question into a focused database query using an LLM, retrieves the most relevant document chunks, and returns them as JSON.",
    func: async (input) => {
      const query = typeof input === "string" ? input : JSON.stringify(input);
      const result = await ragService.searchRelevantChunks(query, 5);
      return JSON.stringify(result);
    },
  });
}
