const express = require('express');
const cors = require('cors');
const apiRouter = require('./routes/api');
const databaseService = require('./services/databaseService');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

app.use('/api', apiRouter);

app.get('/', (req, res) => {
  res.send('EM TaskFlow AI is running with SQLite database.');
});

// Initialize database and start server
async function startServer() {
  try {
    await databaseService.initialize();
    console.log('Database initialized successfully');
    
    app.listen(PORT, () => {
      console.log(`🚀 EM TaskFlow AI server listening on port ${PORT}`);
      console.log('📊 SQLite database ready for operations');
    });
  } catch (error) {
    console.error('Failed to initialize database:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down gracefully...');
  databaseService.close();
  process.exit(0);
});

startServer();
