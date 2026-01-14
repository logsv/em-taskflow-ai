import express from "express";
import databaseService from "../services/databaseService.js";

const router = express.Router();

router.get("/chat-history", async (req, res) => {
  try {
    const { limit = "50", sessionId } = req.query;
    const history = await databaseService.getChatHistory(parseInt(limit, 10), sessionId || null);
    res.json({ history });
  } catch (error) {
    console.error("Error fetching chat history:", error);
    res.status(500).json({ error: error.message });
  }
});

router.get("/stats", async (req, res) => {
  try {
    const stats = await databaseService.getStats();
    res.json({ stats });
  } catch (error) {
    console.error("Error fetching database stats:", error);
    res.status(500).json({ error: error.message });
  }
});

router.post("/preferences", async (req, res) => {
  try {
    const { key, value } = req.body;

    if (!key || value === undefined) {
      return res.status(400).json({ error: "Key and value are required" });
    }

    const result = await databaseService.setUserPreference(key, value);
    res.json({ success: true, preference: result });
  } catch (error) {
    console.error("Error setting user preference:", error);
    res.status(500).json({ error: error.message });
  }
});

router.get("/preferences/:key", async (req, res) => {
  try {
    const { key } = req.params;
    const value = await databaseService.getUserPreference(key);

    if (value === null) {
      return res.status(404).json({ error: "Preference not found" });
    }

    res.json({ key, value });
  } catch (error) {
    console.error("Error fetching user preference:", error);
    res.status(500).json({ error: error.message });
  }
});

router.get("/cache/:source", async (req, res) => {
  try {
    const { source } = req.params;
    const { maxAge = "3600" } = req.query;

    const cachedData = await databaseService.getCachedTaskData(source, parseInt(maxAge, 10));
    res.json({ cachedData });
  } catch (error) {
    console.error("Error fetching cached data:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;

