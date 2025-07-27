import express, { type Request, type Response } from 'express';
import databaseService from '../services/databaseService.js';

const router = express.Router();

// Type definitions
interface ChatHistoryRequest extends Request {
  query: {
    limit?: string;
    sessionId?: string;
  };
}

interface PreferenceRequest extends Request {
  body: {
    key: string;
    value: any;
  };
}

interface PreferenceParamsRequest extends Request {
  params: {
    key: string;
  };
}

interface CacheRequest extends Request {
  params: {
    source: string;
  };
  query: {
    maxAge?: string;
  };
}

// GET /api/database/chat-history - Get chat history
router.get('/chat-history', async (req: ChatHistoryRequest, res: Response) => {
  try {
    const { limit = '50', sessionId } = req.query;
    const history = await databaseService.getChatHistory(parseInt(limit), sessionId || null);
    res.json({ history });
  } catch (error) {
    console.error('Error fetching chat history:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// GET /api/database/stats - Get database statistics
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const stats = await databaseService.getStats();
    res.json({ stats });
  } catch (error) {
    console.error('Error fetching database stats:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// POST /api/database/preferences - Set user preference
router.post('/preferences', async (req: PreferenceRequest, res: Response) => {
  try {
    const { key, value } = req.body;
    
    if (!key || value === undefined) {
      return res.status(400).json({ error: 'Key and value are required' });
    }
    
    const result = await databaseService.setUserPreference(key, value);
    res.json({ success: true, preference: result });
  } catch (error) {
    console.error('Error setting user preference:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// GET /api/database/preferences/:key - Get user preference
router.get('/preferences/:key', async (req: PreferenceParamsRequest, res: Response) => {
  try {
    const { key } = req.params;
    const value = await databaseService.getUserPreference(key);
    
    if (value === null) {
      return res.status(404).json({ error: 'Preference not found' });
    }
    
    res.json({ key, value });
  } catch (error) {
    console.error('Error fetching user preference:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// GET /api/database/cache/:source - Get cached task data
router.get('/cache/:source', async (req: CacheRequest, res: Response) => {
  try {
    const { source } = req.params;
    const { maxAge = '3600' } = req.query;
    
    const cachedData = await databaseService.getCachedTaskData(source, parseInt(maxAge));
    res.json({ cachedData });
  } catch (error) {
    console.error('Error fetching cached data:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

export default router;
