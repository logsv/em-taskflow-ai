import databaseService from '../../src/services/databaseService.js';
import sinon from 'sinon';
describe('Database Service', () => {
    afterEach(() => {
        sinon.restore();
    });
    it('should retrieve chat history', async () => {
        const mockHistory = [
            {
                id: 1,
                user_message: 'test query',
                ai_response: 'test response',
                timestamp: new Date().toISOString(),
                session_id: 'test-session',
                metadata: null,
            },
        ];
        const getChatHistoryStub = sinon
            .stub(databaseService, 'getChatHistory')
            .resolves(mockHistory);
        const history = await databaseService.getChatHistory();
        expect(history).toEqual(mockHistory);
        expect(getChatHistoryStub.calledOnce).toBe(true);
    });
});
