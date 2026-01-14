const mcpLlmService = {
  async complete() {
    throw new Error('mcpLlmService.complete not implemented');
  },

  isInitialized() {
    return false;
  },

  async initialize() {
    return;
  },
};

export default mcpLlmService;

