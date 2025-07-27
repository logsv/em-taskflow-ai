interface ChatHistoryRecord {
    id: number;
    user_message: string;
    ai_response: string;
    timestamp: string;
    session_id: string | null;
    metadata: string | null;
}
interface TaskCacheRecord {
    id: number;
    source: string;
    task_id: string;
    data: any;
    last_updated: string;
}
interface DatabaseStats {
    chatHistory: number;
    cachedTasks: number;
    userPreferences: number;
}
interface SaveResult {
    id: number;
}
interface PreferenceResult {
    key: string;
    value: any;
}
declare class DatabaseService {
    private db;
    private dbPath;
    constructor();
    initialize(): Promise<void>;
    private createTables;
    saveChatHistory(userMessage: string, aiResponse: string, sessionId?: string | null, metadata?: any): Promise<SaveResult>;
    getChatHistory(limit?: number, sessionId?: string | null): Promise<ChatHistoryRecord[]>;
    cacheTaskData(source: string, taskId: string, data: any): Promise<SaveResult>;
    getCachedTaskData(source: string, maxAge?: number): Promise<TaskCacheRecord[]>;
    setUserPreference(key: string, value: any): Promise<PreferenceResult>;
    getUserPreference(key: string): Promise<any>;
    getStats(): Promise<DatabaseStats>;
    close(): void;
}
declare const databaseService: DatabaseService;
export default databaseService;
//# sourceMappingURL=databaseService.d.ts.map