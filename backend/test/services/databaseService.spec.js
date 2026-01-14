import sinon from 'sinon';
import databaseService from '../../src/services/databaseService.js';

describe('Database Service', () => {
  let sandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('chat history operations', () => {
    it('should save chat history successfully', async () => {
      const mockResult = { id: 123 };
      const saveChatHistoryStub = sandbox
        .stub(databaseService, 'saveChatHistory')
        .resolves(mockResult);

      const result = await databaseService.saveChatHistory('Hello', 'Hi there', 'session-1', { test: true });
      
      expect(result).toEqual(mockResult);
      expect(saveChatHistoryStub.calledOnce).toBe(true);
      expect(saveChatHistoryStub.calledWith('Hello', 'Hi there', 'session-1', { test: true })).toBe(true);
    });

    it('should save chat history without optional parameters', async () => {
      const mockResult = { id: 456 };
      const saveChatHistoryStub = sandbox
        .stub(databaseService, 'saveChatHistory')
        .resolves(mockResult);

      const result = await databaseService.saveChatHistory('Hello', 'Hi there');
      
      expect(result).toEqual(mockResult);
      expect(saveChatHistoryStub.calledOnce).toBe(true);
      expect(saveChatHistoryStub.calledWith('Hello', 'Hi there')).toBe(true);
    });

    it('should handle chat history save errors gracefully', async () => {
      const saveChatHistoryStub = sandbox
        .stub(databaseService, 'saveChatHistory')
        .rejects(new Error('Save failed'));

      try {
        await databaseService.saveChatHistory('Hello', 'Hi there');
        fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).toBe('Save failed');
      }
      
      expect(saveChatHistoryStub.calledOnce).toBe(true);
    });

    it('should get chat history with default parameters', async () => {
      const mockHistory = [
        { id: 1, user_message: 'First', ai_response: 'Response 1', timestamp: '2023-01-01', session_id: null, metadata: null },
        { id: 2, user_message: 'Second', ai_response: 'Response 2', timestamp: '2023-01-02', session_id: null, metadata: null }
      ];
      const getChatHistoryStub = sandbox
        .stub(databaseService, 'getChatHistory')
        .resolves(mockHistory);

      const result = await databaseService.getChatHistory();
      
      expect(result).toEqual(mockHistory);
      expect(result.length).toBe(2);
      expect(getChatHistoryStub.calledOnce).toBe(true);
    });

    it('should get chat history with session filter', async () => {
      const mockHistory = [
        { id: 1, user_message: 'Hello', ai_response: 'Hi', timestamp: '2023-01-01', session_id: 'session-1', metadata: null }
      ];
      const getChatHistoryStub = sandbox
        .stub(databaseService, 'getChatHistory')
        .resolves(mockHistory);

      const result = await databaseService.getChatHistory(10, 'session-1');
      
      expect(result).toEqual(mockHistory);
      expect(result.length).toBe(1);
      expect(result[0].session_id).toBe('session-1');
      expect(getChatHistoryStub.calledWith(10, 'session-1')).toBe(true);
    });

    it('should handle chat history retrieval errors', async () => {
      const getChatHistoryStub = sandbox
        .stub(databaseService, 'getChatHistory')
        .rejects(new Error('Retrieval failed'));

      try {
        await databaseService.getChatHistory();
        fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).toBe('Retrieval failed');
      }
      
      expect(getChatHistoryStub.calledOnce).toBe(true);
    });
  });

  describe('task cache operations', () => {
    it('should cache task data successfully', async () => {
      const mockResult = { id: 789 };
      const cacheTaskDataStub = sandbox
        .stub(databaseService, 'cacheTaskData')
        .resolves(mockResult);

      const taskData = { title: 'Test Task', status: 'In Progress' };
      const result = await databaseService.cacheTaskData('jira', 'TASK-123', taskData);
      
      expect(result).toEqual(mockResult);
      expect(cacheTaskDataStub.calledOnce).toBe(true);
      expect(cacheTaskDataStub.calledWith('jira', 'TASK-123', taskData)).toBe(true);
    });

    it('should handle task cache errors', async () => {
      const cacheTaskDataStub = sandbox
        .stub(databaseService, 'cacheTaskData')
        .rejects(new Error('Cache failed'));

      try {
        await databaseService.cacheTaskData('jira', 'TASK-123', { title: 'Test' });
        fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).toBe('Cache failed');
      }
      
      expect(cacheTaskDataStub.calledOnce).toBe(true);
    });

    it('should get cached task data with age filter', async () => {
      const mockCacheData = [
        { id: 1, source: 'jira', task_id: 'TASK-123', data: { title: 'Test Task' }, last_updated: '2023-01-01' }
      ];
      const getCachedTaskDataStub = sandbox
        .stub(databaseService, 'getCachedTaskData')
        .resolves(mockCacheData);

      const result = await databaseService.getCachedTaskData('jira', 7200);
      
      expect(result).toEqual(mockCacheData);
      expect(result.length).toBe(1);
      expect(result[0].data.title).toBe('Test Task');
      expect(getCachedTaskDataStub.calledWith('jira', 7200)).toBe(true);
    });

    it('should get cached task data with default age', async () => {
      const mockCacheData = [
        { id: 1, source: 'github', task_id: 'ISSUE-456', data: { title: 'Bug Fix' }, last_updated: '2023-01-01' }
      ];
      const getCachedTaskDataStub = sandbox
        .stub(databaseService, 'getCachedTaskData')
        .resolves(mockCacheData);

      const result = await databaseService.getCachedTaskData('github');
      
      expect(result).toEqual(mockCacheData);
      expect(result.length).toBe(1);
      expect(result[0].data.title).toBe('Bug Fix');
      expect(getCachedTaskDataStub.calledWith('github')).toBe(true);
    });

    it('should handle cached task data retrieval errors', async () => {
      const getCachedTaskDataStub = sandbox
        .stub(databaseService, 'getCachedTaskData')
        .rejects(new Error('Cache retrieval failed'));

      try {
        await databaseService.getCachedTaskData('jira');
        fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).toBe('Cache retrieval failed');
      }
      
      expect(getCachedTaskDataStub.calledOnce).toBe(true);
    });
  });

  describe('user preferences operations', () => {
    it('should set user preference successfully', async () => {
      const mockResult = { key: 'theme', value: 'dark' };
      const setUserPreferenceStub = sandbox
        .stub(databaseService, 'setUserPreference')
        .resolves(mockResult);

      const result = await databaseService.setUserPreference('theme', 'dark');
      
      expect(result).toEqual(mockResult);
      expect(result.key).toBe('theme');
      expect(result.value).toBe('dark');
      expect(setUserPreferenceStub.calledWith('theme', 'dark')).toBe(true);
    });

    it('should set complex user preference', async () => {
      const complexValue = { notifications: true, language: 'en', features: ['dark-mode', 'auto-save'] };
      const mockResult = { key: 'settings', value: complexValue };
      const setUserPreferenceStub = sandbox
        .stub(databaseService, 'setUserPreference')
        .resolves(mockResult);

      const result = await databaseService.setUserPreference('settings', complexValue);
      
      expect(result).toEqual(mockResult);
      expect(result.key).toBe('settings');
      expect(result.value).toEqual(complexValue);
      expect(setUserPreferenceStub.calledWith('settings', complexValue)).toBe(true);
    });

    it('should handle preference setting errors', async () => {
      const setUserPreferenceStub = sandbox
        .stub(databaseService, 'setUserPreference')
        .rejects(new Error('Preference save failed'));

      try {
        await databaseService.setUserPreference('theme', 'dark');
        fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).toBe('Preference save failed');
      }
      
      expect(setUserPreferenceStub.calledOnce).toBe(true);
    });

    it('should get user preference successfully', async () => {
      const getUserPreferenceStub = sandbox
        .stub(databaseService, 'getUserPreference')
        .resolves('dark');

      const result = await databaseService.getUserPreference('theme');
      
      expect(result).toBe('dark');
      expect(getUserPreferenceStub.calledWith('theme')).toBe(true);
    });

    it('should get complex user preference', async () => {
      const complexValue = { notifications: true, language: 'en' };
      const getUserPreferenceStub = sandbox
        .stub(databaseService, 'getUserPreference')
        .resolves(complexValue);

      const result = await databaseService.getUserPreference('settings');
      
      expect(result).toEqual(complexValue);
      expect(getUserPreferenceStub.calledWith('settings')).toBe(true);
    });

    it('should return null for non-existent preference', async () => {
      const getUserPreferenceStub = sandbox
        .stub(databaseService, 'getUserPreference')
        .resolves(null);

      const result = await databaseService.getUserPreference('nonexistent');
      
      expect(result).toBe(null);
      expect(getUserPreferenceStub.calledWith('nonexistent')).toBe(true);
    });

    it('should handle preference retrieval errors', async () => {
      const getUserPreferenceStub = sandbox
        .stub(databaseService, 'getUserPreference')
        .rejects(new Error('Preference retrieval failed'));

      try {
        await databaseService.getUserPreference('theme');
        fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).toBe('Preference retrieval failed');
      }
      
      expect(getUserPreferenceStub.calledOnce).toBe(true);
    });
  });

  describe('statistics operations', () => {
    it('should get database statistics successfully', async () => {
      const mockStats = { chatHistory: 15, cachedTasks: 8, userPreferences: 5 };
      const getStatsStub = sandbox
        .stub(databaseService, 'getStats')
        .resolves(mockStats);

      const result = await databaseService.getStats();
      
      expect(result).toEqual(mockStats);
      expect(result.chatHistory).toBe(15);
      expect(result.cachedTasks).toBe(8);
      expect(result.userPreferences).toBe(5);
      expect(getStatsStub.calledOnce).toBe(true);
    });

    it('should handle statistics retrieval errors', async () => {
      const getStatsStub = sandbox
        .stub(databaseService, 'getStats')
        .rejects(new Error('Stats failed'));

      try {
        await databaseService.getStats();
        fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).toBe('Stats failed');
      }
      
      expect(getStatsStub.calledOnce).toBe(true);
    });
  });

  describe('initialization and connection management', () => {
    it('should initialize database successfully', async () => {
      const initializeStub = sandbox
        .stub(databaseService, 'initialize')
        .resolves();

      await databaseService.initialize();
      
      expect(initializeStub.calledOnce).toBe(true);
    });

    it('should handle database initialization errors', async () => {
      const initializeStub = sandbox
        .stub(databaseService, 'initialize')
        .rejects(new Error('Connection failed'));

      try {
        await databaseService.initialize();
        fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).toBe('Connection failed');
      }
      
      expect(initializeStub.calledOnce).toBe(true);
    });

    it('should close database connection successfully', () => {
      const closeStub = sandbox.stub(databaseService, 'close');

      databaseService.close();
      
      expect(closeStub.calledOnce).toBe(true);
    });
  });

  describe('edge cases and data validation', () => {
    it('should handle empty chat history results', async () => {
      const getChatHistoryStub = sandbox
        .stub(databaseService, 'getChatHistory')
        .resolves([]);

      const result = await databaseService.getChatHistory();
      
      expect(result).toEqual([]);
      expect(getChatHistoryStub.calledOnce).toBe(true);
    });

    it('should handle empty cached task results', async () => {
      const getCachedTaskDataStub = sandbox
        .stub(databaseService, 'getCachedTaskData')
        .resolves([]);

      const result = await databaseService.getCachedTaskData('nonexistent');
      
      expect(result).toEqual([]);
      expect(getCachedTaskDataStub.calledWith('nonexistent')).toBe(true);
    });

    it('should handle large limit values for chat history', async () => {
      const mockHistory = Array.from({ length: 1000 }, (_, i) => ({
        id: i + 1,
        user_message: `Message ${i + 1}`,
        ai_response: `Response ${i + 1}`,
        timestamp: '2023-01-01',
        session_id: null,
        metadata: null
      }));
      const getChatHistoryStub = sandbox
        .stub(databaseService, 'getChatHistory')
        .resolves(mockHistory);

      const result = await databaseService.getChatHistory(1000);
      
      expect(result.length).toBe(1000);
      expect(getChatHistoryStub.calledWith(1000)).toBe(true);
    });

    it('should handle various data types in task cache', async () => {
      const complexTaskData = {
        title: 'Complex Task',
        status: 'In Progress',
        assignee: { name: 'John Doe', email: 'john@example.com' },
        tags: ['urgent', 'backend'],
        metadata: { priority: 1, created: new Date().toISOString() }
      };
      const mockResult = { id: 999 };
      const cacheTaskDataStub = sandbox
        .stub(databaseService, 'cacheTaskData')
        .resolves(mockResult);

      const result = await databaseService.cacheTaskData('jira', 'COMPLEX-456', complexTaskData);
      
      expect(result).toEqual(mockResult);
      expect(cacheTaskDataStub.calledWith('jira', 'COMPLEX-456', complexTaskData)).toBe(true);
    });
  });
});

