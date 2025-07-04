const { google } = require('googleapis');
require('dotenv').config();
const { startOfDay, endOfDay } = require('date-fns');

const oAuth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);
oAuth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });

const calendar = google.calendar({ version: 'v3', auth: oAuth2Client });

/**
 * Fetch today's events from Google Calendar.
 * Returns array of { id, summary, start, end, attendees, hangoutLink }
 */
async function fetchTodaysEvents() {
  try {
    const now = new Date();
    const timeMin = startOfDay(now).toISOString();
    const timeMax = endOfDay(now).toISOString();
    const res = await calendar.events.list({
      calendarId: 'primary',
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: 'startTime',
    });
    return res.data.items.map(event => ({
      id: event.id,
      summary: event.summary,
      start: event.start.dateTime || event.start.date,
      end: event.end.dateTime || event.end.date,
      attendees: event.attendees || [],
      hangoutLink: event.hangoutLink || null
    }));
  } catch (error) {
    console.error('Error fetching today\'s calendar events:', error.message);
    return [];
  }
}

/**
 * Detect scheduling conflicts in a list of events.
 * Returns array of pairs of conflicting events.
 */
function detectConflicts(events) {
  const conflicts = [];
  // Sort events by start time
  const sorted = events.slice().sort((a, b) => new Date(a.start) - new Date(b.start));
  for (let i = 0; i < sorted.length - 1; i++) {
    const currEnd = new Date(sorted[i].end);
    const nextStart = new Date(sorted[i + 1].start);
    if (currEnd > nextStart) {
      conflicts.push([sorted[i], sorted[i + 1]]);
    }
  }
  return conflicts;
}

/**
 * Update a calendar event with a status note/tag (adds to description).
 */
async function updateEventStatus(eventId, note) {
  try {
    // Fetch the event first
    const { data: event } = await calendar.events.get({ calendarId: 'primary', eventId });
    const newDescription = (event.description || '') + `\n[Status Note]: ${note}`;
    await calendar.events.patch({
      calendarId: 'primary',
      eventId,
      requestBody: { description: newDescription }
    });
    return true;
  } catch (error) {
    console.error(`Error updating calendar event ${eventId}:`, error.message);
    return false;
  }
}

module.exports = { fetchTodaysEvents, detectConflicts, updateEventStatus };
