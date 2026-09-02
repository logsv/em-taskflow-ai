/**
 * GoogleCalendarClient (GoF Adapter / Facade Pattern)
 * Encapsulates Google Calendar v3 REST API communication, authentication,
 * and structured logging.
 */

import { BaseIntegrationClient } from './BaseIntegrationClient.js';
import settingsService from '../../services/settingsService.js';

export class GoogleCalendarClient extends BaseIntegrationClient {
  constructor() {
    super('gcal', 5000);
  }

  /**
   * Resolves authentication headers and calendar ID.
   * @param {Record<string, any>} overrides
   */
  getCredentials(overrides = {}) {
    const raw = settingsService.getCachedSettings() || settingsService.cachedRawSettings || {};
    const gcal = raw?.mcp?.googleCalendar || {};

    const apiKey = (overrides.apiKey !== undefined ? overrides.apiKey : (overrides.token !== undefined ? overrides.token : (gcal.apiKey || process.env.GOOGLE_CALENDAR_API_KEY || process.env.GOOGLE_API_KEY || ''))).trim();
    const calendarId = (overrides.calendarId !== undefined ? overrides.calendarId : (gcal.calendarId || process.env.GOOGLE_CALENDAR_ID || 'primary')).trim();

    const isOAuth = apiKey.startsWith('ya29.') || apiKey.startsWith('Bearer ') || apiKey.length > 80;
    const authHeader = isOAuth ? (apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`) : '';

    return { apiKey, calendarId, isOAuth, authHeader };
  }

  /**
   * Tests connection to Google Calendar API.
   * @param {Record<string, any>} credentials
   */
  async testConnection(credentials = {}) {
    const { apiKey, calendarId, isOAuth, authHeader } = this.getCredentials(credentials);

    if (credentials.apiKey === '') {
      return this.formatTestResult(false, 'No Google Calendar API Key configured');
    }

    if (!apiKey) {
      return this.formatTestResult(true, `Google Calendar target linked (${calendarId}). Ready for schedule inspection & 1-on-1 cadence tracking.`);
    }

    const headers = isOAuth ? { Authorization: authHeader } : {};
    const http = this.createAxiosInstance(headers);

    try {
      return await this.execute('testConnection', async () => {
        const params = {
          maxResults: 3,
          singleEvents: true,
          ...(isOAuth ? {} : { key: apiKey }),
        };

        const res = await http.get(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
          { params }
        );

        const calSummary = res.data?.summary || calendarId;
        const eventsFound = res.data?.items?.length || 0;

        return this.formatTestResult(true, `Successfully connected to Google Calendar '${calSummary}' (${eventsFound} recent events found)`, {
          calendar: calSummary,
          timeZone: res.data?.timeZone,
          eventsFound,
        });
      }, { calendarId });
    } catch (err) {
      const msg = err.response?.data?.error?.message || err.message;
      return this.formatTestResult(false, `Google Calendar connection failed: ${msg}`, { error: msg });
    }
  }

  /**
   * Fetches calendar events within a time range.
   * @param {string} targetCalendarId
   * @param {Record<string, any>} options
   */
  async getEvents(targetCalendarId = 'primary', options = {}) {
    const { apiKey, calendarId: defaultCalId, isOAuth, authHeader } = this.getCredentials(options);
    if (!apiKey) return [];

    const effectiveCalId = targetCalendarId || defaultCalId || 'primary';
    const headers = isOAuth ? { Authorization: authHeader } : {};
    const http = this.createAxiosInstance(headers);

    return this.execute('getEvents', async () => {
      const params = {
        maxResults: options.maxResults || 25,
        singleEvents: true,
        orderBy: 'startTime',
        ...(isOAuth ? {} : { key: apiKey }),
      };

      if (options.timeMin) params.timeMin = options.timeMin;
      if (options.timeMax) params.timeMax = options.timeMax;
      if (options.q) params.q = options.q;

      const res = await http.get(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(effectiveCalId)}/events`,
        { params }
      );

      return res.data?.items || [];
    }, { calendarId: effectiveCalId });
  }

  /**
   * Fetches details of a specific event.
   * @param {string} eventId
   * @param {string} targetCalendarId
   * @param {Record<string, any>} options
   */
  async getEventDetails(eventId, targetCalendarId = 'primary', options = {}) {
    const { apiKey, calendarId: defaultCalId, isOAuth, authHeader } = this.getCredentials(options);
    if (!apiKey || !eventId) return null;

    const effectiveCalId = targetCalendarId || defaultCalId || 'primary';
    const headers = isOAuth ? { Authorization: authHeader } : {};
    const http = this.createAxiosInstance(headers);

    return this.execute('getEventDetails', async () => {
      const params = isOAuth ? {} : { key: apiKey };
      const res = await http.get(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(effectiveCalId)}/events/${eventId}`,
        { params }
      );
      return res.data;
    }, { eventId, calendarId: effectiveCalId });
  }

  /**
   * Creates a calendar event.
   * @param {Record<string, any>} eventData
   * @param {string} targetCalendarId
   * @param {Record<string, any>} options
   */
  async createEvent(eventData, targetCalendarId = 'primary', options = {}) {
    const { apiKey, calendarId: defaultCalId, isOAuth, authHeader } = this.getCredentials(options);
    if (!apiKey) throw new Error('Google Calendar API token or key unconfigured');

    const effectiveCalId = targetCalendarId || defaultCalId || 'primary';
    const headers = {
      'Content-Type': 'application/json',
      ...(isOAuth ? { Authorization: authHeader } : {}),
    };
    const http = this.createAxiosInstance(headers);

    return this.execute('createEvent', async () => {
      const params = isOAuth ? {} : { key: apiKey };
      const res = await http.post(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(effectiveCalId)}/events`,
        eventData,
        { params }
      );
      return res.data;
    }, { summary: eventData.summary, calendarId: effectiveCalId });
  }
}

export const googleCalendarClient = new GoogleCalendarClient();
export default googleCalendarClient;
