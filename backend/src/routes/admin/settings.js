/**
 * Admin: LLM and integration settings.
 */
import express from 'express';
import settingsService from '../../services/settingsService.js';
import { sendError } from '../../middleware/errorHandler.js';

const router = express.Router();

router.get('/settings', async (req, res) => {
  try {
    const settings = await settingsService.getMaskedSettings();
    res.json({
      success: true,
      settings,
      requestId: req.requestId,
    });
  } catch (err) {
    return sendError(req, res, err, 'Failed to fetch admin settings');
  }
});

// PUT /api/admin/settings - Update model and tool integrations with hot-reload
router.put('/settings', async (req, res) => {
  try {
    const incoming = req.body || {};
    const updated = await settingsService.updateSettings(incoming);
    res.json({
      success: true,
      message: 'Settings saved and hot-reloaded into active runtime',
      settings: updated,
      requestId: req.requestId,
    });
  } catch (err) {
    return sendError(req, res, err, 'Failed to update admin settings');
  }
});

// POST /api/admin/settings/test-connection - Test live connectivity to Ollama, Jira, GitHub, or Notion
router.post('/settings/test-connection', async (req, res) => {
  try {
    const { type, credentials } = req.body || {};
    if (!type) {
      return res.status(400).json({ error: 'Missing connection test type (ollama, jira, github, notion)' });
    }
    const result = await settingsService.testConnection(type, credentials || {});
    res.json({
      ...result,
      type,
      requestId: req.requestId,
    });
  } catch (err) {
    return sendError(req, res, err, 'Failed to run connection test');
  }
});

// POST /api/admin/settings/reset - Reset settings to initial .env defaults
router.post('/settings/reset', async (req, res) => {
  try {
    const resetSettings = await settingsService.resetToEnvDefaults();
    res.json({
      success: true,
      message: 'Settings successfully restored to initial .env defaults',
      settings: resetSettings,
      requestId: req.requestId,
    });
  } catch (err) {
    return sendError(req, res, err, 'Failed to reset admin settings');
  }
});

// ============================================================================
// 👥 Team Members Roster & Identity Directory Routes
// ============================================================================

// GET /api/admin/team - List all team members

export default router;
