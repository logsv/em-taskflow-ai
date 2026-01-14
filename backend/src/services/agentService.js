import langGraphAgentService from "../agent/service.js";

const agentService = {
  async processQuery(query) {
    return langGraphAgentService.processQuery(query, { includeRAG: true });
  },
};

export default agentService;

