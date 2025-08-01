import express from 'express';
import cors from 'cors';
import apiRouter from './routes/api.js';
import databaseService from './services/databaseService.js';
import enhancedLlmService from './services/enhancedLlmService.js';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

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
    
    // Initialize enhanced LLM service
    try {
      await enhancedLlmService.initialize();
      console.log('✅ Enhanced LLM Service initialized successfully');
    } catch (llmError) {
      console.warn('⚠️ Enhanced LLM Service initialization failed, will retry on first use:', llmError);
      // Don't fail startup if LLM service fails to initialize
    }
    
    app.listen(PORT, () => {
      console.log(`🚀 EM TaskFlow AI server listening on port ${PORT}`);
      console.log('📊 SQLite database ready for operations');
      console.log('🤖 Enhanced LLM Service with router available');
      console.log(`🔗 Health check: http://localhost:${PORT}/api/health`);
      console.log(`📈 LLM status: http://localhost:${PORT}/api/llm-status`);
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
