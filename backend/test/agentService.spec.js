import sinon from 'sinon';
import agentService from '../src/services/agentService.js';
import mcpLlmService from '../src/services/mcpLlmService.js';
import databaseService from '../src/services/databaseService.js';
import mcpService from '../src/services/mcpService.js';
import ragService from '../src/services/ragService.js';
const mcpTools = ['jira-tool-1', 'jira-tool-2'];
describe('Agent Service', () => {
    let llmStub;
    let dbStub;
    let mcpStub;
    let ragStub;
    beforeEach(() => {
        llmStub = sinon.stub(mcpLlmService, 'complete');
        dbStub = sinon.stub(databaseService, 'saveChatHistory');
        mcpStub = sinon.stub(mcpService, 'getTools');
        sinon.stub(mcpService, 'initialize').resolves();
        sinon.stub(mcpService, 'isReady').returns(true);
        sinon.stub(mcpService, 'getServerStatus').resolves({ notion: true, jira: true, calendar: true });
        sinon.stub(mcpService, 'getToolsByServer').resolves(mcpTools.map(name => ({ name })));
        ragStub = sinon.stub(ragService, 'searchRelevantChunks');
        sinon.stub(ragService, 'getStatus').resolves({ ready: true, vectorDB: true, embeddingService: true });
    });
    afterEach(() => {
        sinon.restore();
    });
    it('should process a query and return a response', async () => {
        const userQuery = 'What is the status of my tasks?';
        const intentAnalysis = {
            intent: 'status_check',
            dataNeeded: ['jira'],
            reasoning: 'The user is asking for task status.',
        };
        const ragResult = { chunks: [], context: '', sources: [], found: 0 };
        const generatedResponse = 'Your tasks are all on track.';
        llmStub.onFirstCall().resolves(JSON.stringify(intentAnalysis));
        llmStub.onSecondCall().resolves(generatedResponse);
        ragStub.resolves(ragResult);
        mcpStub.resolves([]);
        const response = await agentService.processQuery(userQuery);
        expect(response).toBe(generatedResponse);
        expect(llmStub.callCount).toBe(2);
        expect(ragStub.calledOnce).toBe(true);
        expect(dbStub.calledOnceWith(userQuery, generatedResponse)).toBe(true);
    });
    it('should include RAG results in the prompt to the LLM', async () => {
        const userQuery = 'What is the status of my tasks?';
        const intentAnalysis = {
            intent: 'status_check',
            dataNeeded: ['jira'],
            reasoning: 'The user is asking for task status.',
        };
        const ragResult = {
            chunks: [{ id: '1', text: 'chunk1', metadata: {} }],
            context: 'rag context',
            sources: [],
            found: 1,
        };
        const generatedResponse = 'Your tasks are all on track.';
        llmStub.onFirstCall().resolves(JSON.stringify(intentAnalysis));
        llmStub.onSecondCall().resolves(generatedResponse);
        ragStub.resolves(ragResult);
        mcpStub.resolves([]);
        await agentService.processQuery(userQuery);
        const finalPrompt = llmStub.secondCall.args[0];
        expect(finalPrompt).toContain('rag context');
    });
    it('should include MCP tools in the prompt to the LLM', async () => {
        const userQuery = 'What is the status of my tasks?';
        const intentAnalysis = {
            intent: 'status_check',
            dataNeeded: ['jira'],
            reasoning: 'The user is asking for task status.',
        };
        const ragResult = { chunks: [], context: '', sources: [], found: 0 };
        const generatedResponse = 'Your tasks are all on track.';
        const mcpTools = ['jira-tool-1', 'jira-tool-2'];
        llmStub.onFirstCall().resolves(JSON.stringify(intentAnalysis));
        llmStub.onSecondCall().resolves(generatedResponse);
        ragStub.resolves(ragResult);
        mcpStub.resolves(mcpTools);
        await agentService.processQuery(userQuery);
        const finalPrompt = llmStub.secondCall.args[0];
        expect(finalPrompt).toContain('Available Jira MCP Tools:');
        expect(finalPrompt).toContain('jira-tool-1');
        expect(finalPrompt).toContain('jira-tool-2');
    });
});
