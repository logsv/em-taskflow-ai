const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class DatabaseService {
  constructor() {
    this.db = null;
    this.dbPath = path.join(__dirname, '../../data/taskflow.db');
  }

  // Initialize database connection and create tables
  async initialize() {
    return new Promise((resolve, reject) => {
      // Create data directory if it doesn't exist
      const fs = require('fs');
      const dataDir = path.dirname(this.dbPath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      this.db = new sqlite3.Database(this.dbPath, (err) => {
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
  async createTables() {
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

      this.db.serialize(() => {
        this.db.run(chatHistoryTable);
        this.db.run(userPreferencesTable);
        this.db.run(taskCacheTable, (err) => {
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
  async saveChatHistory(userMessage, aiResponse, sessionId = null, metadata = null) {
    return new Promise((resolve, reject) => {
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
  async getChatHistory(limit = 50, sessionId = null) {
    return new Promise((resolve, reject) => {
      let query = `
        SELECT * FROM chat_history
        ${sessionId ? 'WHERE session_id = ?' : ''}
        ORDER BY timestamp DESC
        LIMIT ?
      `;
      
      const params = sessionId ? [sessionId, limit] : [limit];
      
      this.db.all(query, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows.reverse()); // Return in chronological order
        }
      });
    });
  }

  // Cache task data
  async cacheTaskData(source, taskId, data) {
    return new Promise((resolve, reject) => {
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
  async getCachedTaskData(source, maxAge = 3600) { // maxAge in seconds, default 1 hour
    return new Promise((resolve, reject) => {
      const query = `
        SELECT * FROM task_cache
        WHERE source = ?
        AND datetime(last_updated, '+${maxAge} seconds') > datetime('now')
        ORDER BY last_updated DESC
      `;
      
      this.db.all(query, [source], (err, rows) => {
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
  async setUserPreference(key, value) {
    return new Promise((resolve, reject) => {
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
  async getUserPreference(key) {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT value FROM user_preferences WHERE key = ?',
        [key],
        (err, row) => {
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
  async getStats() {
    return new Promise((resolve, reject) => {
      const queries = [
        'SELECT COUNT(*) as chat_count FROM chat_history',
        'SELECT COUNT(*) as cache_count FROM task_cache',
        'SELECT COUNT(*) as preferences_count FROM user_preferences'
      ];

      Promise.all(queries.map(query => 
        new Promise((res, rej) => {
          this.db.get(query, (err, row) => {
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
  close() {
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

module.exports = new DatabaseService();