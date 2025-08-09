import express from 'express';
import cors from 'cors';
import apiRouter from './routes/api.js';
import databaseService from './services/databaseService.js';
import { initializeMCPRouter } from './services/newLlmRouter.js';
import { config, getServerConfig, getMcpConfig, getDatabaseConfig, getLlmConfig, getRagConfig } from './config/index.js';
import dotenv from 'dotenv';
import mcpService from './services/mcpService.js';

// Load environment variables first, then override with convict config
dotenv.config();

const app = express();
const serverConfig = getServerConfig();
const PORT = serverConfig.port;

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
      const mcpConfig = getMcpConfig();
      const notionEnabled = mcpConfig.notion.enabled;
      const notionKeyLen = mcpConfig.notion.apiKey?.length || 0;
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
    
    const databaseConfig = getDatabaseConfig();
    const llmConfig = getLlmConfig();
    const ragConfig = getRagConfig();
    
    app.listen(PORT, serverConfig.host, () => {
      console.log(`🚀 EM TaskFlow AI server listening on ${serverConfig.host}:${PORT}`);
      console.log(`📊 Environment: ${config.env}`);
      console.log(`💾 Database: ${databaseConfig.path}`);
      console.log(`🤖 LLM Provider: ${llmConfig.defaultProvider}`);
      console.log(`🔍 RAG Enabled: ${ragConfig.enabled}`);
      console.log(`🔗 Health check: http://${serverConfig.host}:${PORT}/api/health`);
      console.log(`📈 LLM status: http://${serverConfig.host}:${PORT}/api/llm-status`);
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
