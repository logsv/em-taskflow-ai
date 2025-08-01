import databaseService from '../../src/services/databaseService.js';
import ragService from '../../src/services/ragService.js';
describe('Services Test', () => {
    it('should test databaseService', async () => {
        const history = await databaseService.getChatHistory();
        expect(history).toBeDefined();
    });
    it('should test ragService', async () => {
        const status = await ragService.getStatus();
        expect(status).toBeDefined();
    });
});
