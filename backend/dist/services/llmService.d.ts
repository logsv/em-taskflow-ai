interface LLMOptions {
    model?: string;
    max_tokens?: number;
    temperature?: number;
}
/**
 * Unified LLM completion interface
 * @param prompt - The prompt to send to the LLM
 * @param options - Optional: model, maxTokens, etc.
 */
declare function complete(prompt: string, options?: LLMOptions): Promise<string>;
/**
 * Get available models for the current provider
 */
declare function getAvailableModels(): Promise<string[]>;
declare const llmService: {
    complete: typeof complete;
    getAvailableModels: typeof getAvailableModels;
};
export default llmService;
export { complete, getAvailableModels };
//# sourceMappingURL=llmService.d.ts.map