import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { config, getDatabaseConfig } from '../config.js';

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Type definitions
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

interface UserPreferenceRecord {
  id: number;
  key: string;
  value: any;
  updated_at: string;
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

class DatabaseService {
  private db: sqlite3.Database | null;
  private dbPath: string;

  constructor() {
    this.db = null;
    // Use configured database path, resolve relative paths from project root
    const configPath = getDatabaseConfig().path;
    this.dbPath = path.isAbsolute(configPath) 
      ? configPath 
      : path.join(__dirname, '../../', configPath);
  }

  // Initialize database connection and create tables
  async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Create data directory if it doesn't exist
      const dataDir = path.dirname(this.dbPath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      this.db = new (sqlite3.verbose().Database)(this.dbPath, (err: any) => {
        if (err) {
          console.error('Error opening database:', err);
          reject(err);
          return;
        }
        console.log('Connected to SQLite database');
        this.createTables().then(resolve).catch(reject);
      });
    });
  }

  // Create necessary tables
  private async createTables(): Promise<void> {
    return new Promise((resolve, reject) => {
      const chatHistoryTable = `
        CREATE TABLE IF NOT EXISTS chat_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_message TEXT NOT NULL,
          ai_response TEXT NOT NULL,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
          session_id TEXT,
          metadata TEXT
        )
      `;

      const userPreferencesTable = `
        CREATE TABLE IF NOT EXISTS user_preferences (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          key TEXT UNIQUE NOT NULL,
          value TEXT NOT NULL,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `;

      const taskCacheTable = `
        CREATE TABLE IF NOT EXISTS task_cache (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          source TEXT NOT NULL,
          task_id TEXT NOT NULL,
          data TEXT NOT NULL,
          last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(source, task_id)
        )
      `;

      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      this.db.serialize(() => {
        this.db!.run(chatHistoryTable);
        this.db!.run(userPreferencesTable);
        this.db!.run(taskCacheTable, (err) => {
          if (err) {
            reject(err);
          } else {
            console.log('Database tables created successfully');
            resolve();
          }
        });
      });
    });
  }

  // Save chat interaction
  async saveChatHistory(
    userMessage: string, 
    aiResponse: string, 
    sessionId: string | null = null, 
    metadata: any = null
  ): Promise<SaveResult> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const stmt = this.db.prepare(`
        INSERT INTO chat_history (user_message, ai_response, session_id, metadata)
        VALUES (?, ?, ?, ?)
      `);
      
      stmt.run([
        userMessage,
        aiResponse,
        sessionId,
        metadata ? JSON.stringify(metadata) : null
      ], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id: this.lastID });
        }
      });
      
      stmt.finalize();
    });
  }

  // Get chat history
  async getChatHistory(limit: number = 50, sessionId: string | null = null): Promise<ChatHistoryRecord[]> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      let query = `
        SELECT * FROM chat_history
        ${sessionId ? 'WHERE session_id = ?' : ''}
        ORDER BY timestamp DESC
        LIMIT ?
      `;
      
      const params = sessionId ? [sessionId, limit] : [limit];
      
      this.db.all(query, params, (err, rows: ChatHistoryRecord[]) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows.reverse()); // Return in chronological order
        }
      });
    });
  }

  // Cache task data
  async cacheTaskData(source: string, taskId: string, data: any): Promise<SaveResult> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO task_cache (source, task_id, data, last_updated)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      `);
      
      stmt.run([source, taskId, JSON.stringify(data)], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id: this.lastID });
        }
      });
      
      stmt.finalize();
    });
  }

  // Get cached task data
  async getCachedTaskData(source: string, maxAge: number = 3600): Promise<TaskCacheRecord[]> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const query = `
        SELECT * FROM task_cache
        WHERE source = ?
        AND datetime(last_updated, '+${maxAge} seconds') > datetime('now')
        ORDER BY last_updated DESC
      `;
      
      this.db.all(query, [source], (err, rows: any[]) => {
        if (err) {
          reject(err);
        } else {
          const parsedRows = rows.map(row => ({
            ...row,
            data: JSON.parse(row.data)
          }));
          resolve(parsedRows);
        }
      });
    });
  }

  // Save or update user preference
  async setUserPreference(key: string, value: any): Promise<PreferenceResult> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO user_preferences (key, value, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
      `);
      
      stmt.run([key, JSON.stringify(value)], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ key, value });
        }
      });
      
      stmt.finalize();
    });
  }

  // Get user preference
  async getUserPreference(key: string): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      this.db.get(
        'SELECT value FROM user_preferences WHERE key = ?',
        [key],
        (err, row: any) => {
          if (err) {
            reject(err);
          } else {
            resolve(row ? JSON.parse(row.value) : null);
          }
        }
      );
    });
  }

  // Get database statistics
  async getStats(): Promise<DatabaseStats> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const queries = [
        'SELECT COUNT(*) as chat_count FROM chat_history',
        'SELECT COUNT(*) as cache_count FROM task_cache',
        'SELECT COUNT(*) as preferences_count FROM user_preferences'
      ];

      Promise.all(queries.map(query => 
        new Promise<any>((res, rej) => {
          this.db!.get(query, (err, row) => {
            if (err) rej(err);
            else res(row);
          });
        })
      )).then(results => {
        resolve({
          chatHistory: results[0].chat_count,
          cachedTasks: results[1].cache_count,
          userPreferences: results[2].preferences_count
        });
      }).catch(reject);
    });
  }

  // Close database connection
  close(): void {
    if (this.db) {
      this.db.close((err) => {
        if (err) {
          console.error('Error closing database:', err);
        } else {
          console.log('Database connection closed');
        }
      });
    }
  }
}

// Create and export a singleton instance
const databaseService = new DatabaseService();
export default databaseService;
