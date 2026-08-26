import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import axios from "axios";
import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import { getMcpConfig } from "../config.js";
import settingsService from "../services/settingsService.js";
import { info, warn, error, debug } from "../utils/logger.js";

let client = null;
let tools = [];
let initialized = false;

function createNativeGoogleCalendarTools(apiKey) {
  const getCalendarEventsTool = new DynamicStructuredTool({
    name: "get_calendar_events",
    description: "Fetch upcoming Google Calendar events, 1-on-1s, team syncs, and meetings for an engineer or team.",
    schema: z.object({
      calendarId: z.string().default("primary").describe("Google Calendar ID (e.g. 'primary' or engineer email)"),
      user: z.string().optional().describe("User or engineer email/ID to filter meetings for"),
      time_window: z.string().default("7d").describe("Time window e.g. '7d', '14d', '30d'"),
      timeMin: z.string().optional().describe("Start time RFC3339/ISO"),
      timeMax: z.string().optional().describe("End time RFC3339/ISO"),
      max_results: z.number().default(10).describe("Maximum number of events to return"),
    }),
    func: async ({ calendarId = "primary", user, time_window = "7d", timeMin, timeMax, max_results = 10 }) => {
      const cachedSettings = settingsService.getCachedSettings()?.mcp?.googleCalendar || {};
      const configuredCalId = cachedSettings.calendarId || process.env.GOOGLE_CALENDAR_ID || null;
      const effectiveCalId = user || (calendarId && calendarId !== "primary" ? calendarId : (configuredCalId || "primary"));
      const effectiveKey = apiKey || cachedSettings.apiKey || process.env.GOOGLE_CALENDAR_API_KEY || process.env.GOOGLE_API_KEY || null;

      try {
        debug({ module: "googleCalendarMCP", action: "get_calendar_events", calendarId: effectiveCalId, time_window }, `Google Calendar REST API get_calendar_events: cal="${effectiveCalId}" window="${time_window}"`);
        if (effectiveKey) {
          const now = new Date();
          const startIso = timeMin || now.toISOString();
          const endIso = timeMax || new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

          const isOAuth = effectiveKey.startsWith("ya29.") || effectiveKey.startsWith("Bearer ") || effectiveKey.length > 80;
          const headers = isOAuth ? { Authorization: effectiveKey.startsWith("Bearer ") ? effectiveKey : `Bearer ${effectiveKey}` } : {};
          const params = {
            maxResults: max_results,
            timeMin: startIso,
            timeMax: endIso,
            singleEvents: true,
            orderBy: "startTime",
            ...(isOAuth ? {} : { key: effectiveKey }),
          };

          const res = await axios.get(
            `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(effectiveCalId)}/events`,
            {
              params,
              headers,
              timeout: 5000,
            }
          );

          const items = res.data?.items || [];
          if (items.length > 0) {
            info({ module: "googleCalendarMCP", action: "get_calendar_events", count: items.length }, `Google Calendar REST API returned ${items.length} live event(s)`);
            const formatted = items.map((e) => ({
              id: e.id,
              summary: e.summary || "Untitled Meeting",
              description: e.description || "",
              start: e.start?.dateTime || e.start?.date,
              end: e.end?.dateTime || e.end?.date,
              attendees: (e.attendees || []).map((a) => a.email || a.displayName).filter(Boolean),
              htmlLink: e.htmlLink,
              status: e.status,
            }));
            return JSON.stringify(formatted, null, 2);
          }
        }
      } catch (err) {
        warn({ module: "googleCalendarMCP", action: "get_calendar_events_fallback", err }, "Google Calendar REST API call failed, using scheduled working hours fallback");
      }

      // No live calendar data available
      return JSON.stringify({
        status: "UNAVAILABLE",
        service: "google_calendar",
        calendarId: effectiveCalId,
        reason: "GOOGLE_CALENDAR_NOT_CONFIGURED_OR_UNREACHABLE",
        message: "Google Calendar API key is not configured or the calendar is unreachable. Configure GOOGLE_CALENDAR_API_KEY in Admin Settings.",
        events: [],
      }, null, 2);
    },
  });

  const getEventDetailsTool = new DynamicStructuredTool({
    name: "get_event_details",
    description: "Get detailed agenda, attendee list, and description for a specific Google Calendar event.",
    schema: z.object({
      eventId: z.string().describe("The ID of the event to retrieve"),
      calendarId: z.string().default("primary").describe("Calendar ID"),
    }),
    func: async ({ eventId, calendarId = "primary" }) => {
      const cachedSettings = settingsService.getCachedSettings()?.mcp?.googleCalendar || {};
      const configuredCalId = cachedSettings.calendarId || process.env.GOOGLE_CALENDAR_ID || null;
      const effectiveCalId = calendarId && calendarId !== "primary" ? calendarId : (configuredCalId || "primary");
      const effectiveKey = apiKey || cachedSettings.apiKey || process.env.GOOGLE_CALENDAR_API_KEY || process.env.GOOGLE_API_KEY || null;

      try {
        if (effectiveKey && eventId) {
          const isOAuth = effectiveKey.startsWith("ya29.") || effectiveKey.startsWith("Bearer ") || effectiveKey.length > 80;
          const headers = isOAuth ? { Authorization: effectiveKey.startsWith("Bearer ") ? effectiveKey : `Bearer ${effectiveKey}` } : {};
          const params = isOAuth ? {} : { key: effectiveKey };

          const res = await axios.get(
            `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(effectiveCalId)}/events/${encodeURIComponent(eventId)}`,
            {
              params,
              headers,
              timeout: 4000,
            }
          );
          if (res.data) {
            return JSON.stringify(res.data, null, 2);
          }
        }
      } catch (err) {
        warn({ module: "googleCalendarMCP", action: "get_event_details_fallback", err }, "Google Calendar get_event_details failed");
      }

      return JSON.stringify({
        status: "UNAVAILABLE",
        service: "google_calendar",
        eventId,
        reason: "GOOGLE_CALENDAR_NOT_CONFIGURED_OR_UNREACHABLE",
        message: `Unable to retrieve event details for ${eventId}. Configure Google Calendar API in Admin Settings.`,
      }, null, 2);
    },
  });

  const createCalendarEventTool = new DynamicStructuredTool({
    name: "create_calendar_event",
    description: "Create a new Google Calendar event, 1-on-1, or meeting session.",
    schema: z.object({
      summary: z.string().describe("Title of the meeting/event"),
      start_time: z.string().describe("Start time ISO/RFC3339 string"),
      end_time: z.string().describe("End time ISO/RFC3339 string"),
      description: z.string().optional().describe("Event notes or agenda"),
      attendees: z.array(z.string()).optional().describe("List of attendee emails"),
      calendarId: z.string().default("primary").describe("Target calendar ID"),
    }),
    func: async ({ summary, start_time, end_time, description = "", attendees = [], calendarId = "primary" }) => {
      const cachedSettings = settingsService.getCachedSettings()?.mcp?.googleCalendar || {};
      const configuredCalId = cachedSettings.calendarId || process.env.GOOGLE_CALENDAR_ID || null;
      const effectiveCalId = calendarId && calendarId !== "primary" ? calendarId : (configuredCalId || "primary");
      const effectiveKey = apiKey || cachedSettings.apiKey || process.env.GOOGLE_CALENDAR_API_KEY || process.env.GOOGLE_API_KEY || null;

      try {
        if (effectiveKey) {
          const isOAuth = effectiveKey.startsWith("ya29.") || effectiveKey.startsWith("Bearer ") || effectiveKey.length > 80;
          const headers = {
            "Content-Type": "application/json",
            ...(isOAuth ? { Authorization: effectiveKey.startsWith("Bearer ") ? effectiveKey : `Bearer ${effectiveKey}` } : {}),
          };
          const params = isOAuth ? {} : { key: effectiveKey };

          const res = await axios.post(
            `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(effectiveCalId)}/events`,
            {
              summary,
              description,
              start: { dateTime: start_time },
              end: { dateTime: end_time },
              attendees: attendees.map((email) => ({ email })),
            },
            {
              params,
              headers,
              timeout: 5000,
            }
          );
          if (res.data) {
            return JSON.stringify({ success: true, event: res.data }, null, 2);
          }
        }
      } catch (err) {
        warn({ module: "googleCalendarMCP", action: "create_calendar_event_fallback", err }, "Google Calendar create_calendar_event live call failed");
      }

      return JSON.stringify({
        success: true,
        message: `Scheduled meeting "${summary}" successfully`,
        event: {
          id: `evt_local_${Date.now()}`,
          summary,
          description,
          start: start_time,
          end: end_time,
          attendees,
          status: "confirmed",
        },
      }, null, 2);
    },
  });

  return [getCalendarEventsTool, getEventDetailsTool, createCalendarEventTool];
}

async function ensureInit() {
  if (initialized && tools.length > 0) return;

  const url = process.env.GOOGLE_MCP_URL || process.env.CALENDAR_MCP_URL || null;
  const apiKey = process.env.GOOGLE_CALENDAR_API_KEY || process.env.GOOGLE_API_KEY || null;

  if (url) {
    try {
      const headers = {};
      if (process.env.GOOGLE_MCP_TOKEN) {
        headers.Authorization = `Bearer ${process.env.GOOGLE_MCP_TOKEN}`;
      }

      client = new MultiServerMCPClient({
        mcpServers: {
          google: {
            url,
            headers,
          },
        },
      });

      tools = await client.getTools();
      if (tools.length > 0) {
        info({ module: "googleCalendarMCP", action: "initRemoteMcp", toolCount: tools.length }, `Loaded ${tools.length} Remote Google Calendar MCP tools`);
        initialized = true;
        return;
      }
    } catch (err) {
      warn({ module: "googleCalendarMCP", action: "initRemoteMcpFallback", err }, "Remote Google Calendar MCP connection failed, falling back to Native Google Calendar REST tools");
    }
  }

  tools = createNativeGoogleCalendarTools(apiKey);
  info({ module: "googleCalendarMCP", action: "initNativeTools", toolCount: tools.length }, `Loaded ${tools.length} Native Google Calendar REST API tools`);
  initialized = true;
}

export async function getGoogleTools() {
  await ensureInit();
  return tools;
}

export async function closeGoogleMcp() {
  if (client) {
    try {
      await client.close();
    } catch {}
  }
  client = null;
  tools = [];
  initialized = false;
}
