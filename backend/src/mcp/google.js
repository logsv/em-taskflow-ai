/**
 * Google Calendar MCP Tool Harness (GoF Adapter / Facade Pattern)
 * Declarative DynamicStructuredTools wrapping the unified GoogleCalendarClient.
 */

import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import googleCalendarClient from "../integrations/clients/GoogleCalendarClient.js";
import { info, warn, debug } from "../utils/logger.js";

export function createNativeGoogleCalendarTools() {
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
      const effectiveCalId = user || calendarId || "primary";
      try {
        debug({ module: "googleCalendarMCP", action: "get_calendar_events", calendarId: effectiveCalId, time_window }, `Executing get_calendar_events: cal="${effectiveCalId}" window="${time_window}"`);
        const now = new Date();
        const startIso = timeMin || now.toISOString();
        const days = time_window === "30d" ? 30 : (time_window === "14d" ? 14 : 7);
        const endIso = timeMax || new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();

        const items = await googleCalendarClient.getEvents(effectiveCalId, {
          timeMin: startIso,
          timeMax: endIso,
          maxResults: max_results,
        });

        if (items.length > 0) {
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

        return JSON.stringify([], null, 2);
      } catch (err) {
        warn({ module: "googleCalendarMCP", action: "get_calendar_events_error", calendarId: effectiveCalId, err: err.message }, "Google Calendar get_calendar_events failed");
        return JSON.stringify({
          status: "UNAVAILABLE",
          service: "google_calendar",
          calendarId: effectiveCalId,
          reason: "GOOGLE_CALENDAR_NOT_CONFIGURED_OR_UNREACHABLE",
          message: `Google Calendar events unavailable: ${err.message}. Configure GOOGLE_CALENDAR_API_KEY in Admin Settings.`,
          events: [],
        }, null, 2);
      }
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
      try {
        debug({ module: "googleCalendarMCP", action: "get_event_details", eventId, calendarId }, `Executing get_event_details: ${eventId}`);
        const eventData = await googleCalendarClient.getEventDetails(eventId, calendarId);
        if (eventData) {
          return JSON.stringify(eventData, null, 2);
        }
        throw new Error(`Event ${eventId} not found`);
      } catch (err) {
        warn({ module: "googleCalendarMCP", action: "get_event_details_error", eventId, err: err.message }, `Google Calendar get_event_details failed for ${eventId}`);
        return JSON.stringify({
          status: "UNAVAILABLE",
          service: "google_calendar",
          eventId,
          reason: "GOOGLE_CALENDAR_NOT_CONFIGURED_OR_UNREACHABLE",
          message: `Unable to retrieve event details for ${eventId}: ${err.message}. Configure Google Calendar in Admin Settings.`,
        }, null, 2);
      }
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
      try {
        debug({ module: "googleCalendarMCP", action: "create_calendar_event", summary, calendarId }, `Executing create_calendar_event: ${summary}`);
        const eventPayload = {
          summary,
          description,
          start: { dateTime: start_time },
          end: { dateTime: end_time },
          attendees: attendees.map((email) => ({ email })),
        };
        const created = await googleCalendarClient.createEvent(eventPayload, calendarId);
        return JSON.stringify({ success: true, event: created }, null, 2);
      } catch (err) {
        warn({ module: "googleCalendarMCP", action: "create_calendar_event_error", summary, err: err.message }, `Google Calendar createEvent failed for ${summary}`);
        return JSON.stringify({
          success: false,
          status: "UNAVAILABLE",
          service: "google_calendar",
          reason: "GOOGLE_CALENDAR_NOT_CONFIGURED_OR_UNREACHABLE",
          message: `Unable to create Google Calendar event: ${err.message}.`,
        }, null, 2);
      }
    },
  });

  return [getCalendarEventsTool, getEventDetailsTool, createCalendarEventTool];
}

let cachedTools = null;

export async function getGoogleTools() {
  if (!cachedTools) {
    cachedTools = createNativeGoogleCalendarTools();
    info({ module: "googleCalendarMCP", action: "getGoogleTools", toolCount: cachedTools.length }, `Initialized ${cachedTools.length} Native Google Calendar REST tools`);
  }
  return cachedTools;
}

export async function closeGoogleMcp() {
  cachedTools = null;
}

export default getGoogleTools;
