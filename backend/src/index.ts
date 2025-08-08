import express from 'express';
import cors from 'cors';
import apiRouter from './routes/api.js';
import databaseService from './services/databaseService.js';
import { initializeMCPRouter } from './services/newLlmRouter.js';
import config from './config/config.js';
import dotenv from 'dotenv';
import mcpService from './services/mcpService.js';

// Load environment variables first, then override with convict config
dotenv.config();

const app = express();
const PORT = config.get('server.port');

app.use(cors());
app.use(express.json());

app.use('/api', apiRouter);

app.get('/', (req, res) => {
  res.send('EM TaskFlow AI is running with SQLite database.');
});

// Initialize services and start server
async function startServer(): Promise<void> {
  try {
    // Initialize database
    await databaseService.initialize();
    console.log('✅ Database initialized successfully');
    
    // Log Notion config resolution for debugging
    try {
      const notionEnabled = config.get('mcp.notion.enabled');
      const notionKeyLen = (config.get('mcp.notion.apiKey') as string)?.length || 0;
      console.log('🔧 Notion config at startup - enabled:', notionEnabled, 'key length:', notionKeyLen);
    } catch (e) {
      console.warn('⚠️ Could not read Notion config:', e);
    }

    // Initialize MCP Service (agent + servers) proactively
    try {
      await mcpService.initialize();
      console.log('✅ MCP Service initialized at startup');
    } catch (e) {
      console.warn('⚠️ MCP Service init at startup failed:', e);
    }
    
    // Initialize MCP Router with load balancing
    try {
      await initializeMCPRouter();
      console.log('✅ MCP Router with load balancing initialized successfully');
    } catch (mcpError) {
      console.warn('⚠️ MCP Router initialization failed, will retry on first use:', mcpError);
      // Don't fail startup if MCP router fails to initialize
    }
    
    app.listen(PORT, config.get('server.host'), () => {
      console.log(`🚀 EM TaskFlow AI server listening on ${config.get('server.host')}:${PORT}`);
      console.log(`📊 Environment: ${config.get('env')}`);
      console.log(`💾 Database: ${config.get('database.path')}`);
      console.log(`🤖 LLM Provider: ${config.get('llm.provider')}`);
      console.log(`🔍 RAG Enabled: ${config.get('rag.enabled')}`);
      console.log(`🔗 Health check: http://${config.get('server.host')}:${PORT}/api/health`);
      console.log(`📈 LLM status: http://${config.get('server.host')}:${PORT}/api/llm-status`);
    });
  } catch (error) {
    console.error('Failed to initialize services:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down gracefully...');
  databaseService.close();
  console.log('✅ Services shut down successfully');
  process.exit(0);
});

startServer();
