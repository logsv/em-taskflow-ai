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
 * Enhanced scheduling conflict detection with AI suggestions
 */
function detectConflicts(events) {
  const conflicts = [];
  for (let i = 0; i < events.length; i++) {
    for (let j = i + 1; j < events.length; j++) {
      if (eventsOverlap(events[i], events[j])) {
        const conflict = {
          events: [events[i], events[j]],
          type: getConflictType(events[i], events[j]),
          severity: getConflictSeverity(events[i], events[j]),
          suggestions: generateConflictSuggestions(events[i], events[j])
        };
        conflicts.push(conflict);
      }
    }
  }
  return conflicts;
}

/**
 * Check if two events overlap in time
 */
function eventsOverlap(a, b) {
  const aStart = new Date(a.start.dateTime || a.start.date);
  const aEnd = new Date(a.end.dateTime || a.end.date);
  const bStart = new Date(b.start.dateTime || b.start.date);
  const bEnd = new Date(b.end.dateTime || b.end.date);
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Determine the type of conflict
 */
function getConflictType(eventA, eventB) {
  const aStart = new Date(eventA.start.dateTime || eventA.start.date);
  const aEnd = new Date(eventA.end.dateTime || eventA.end.date);
  const bStart = new Date(eventB.start.dateTime || eventB.start.date);
  const bEnd = new Date(eventB.end.dateTime || eventB.end.date);
  
  if (aStart.getTime() === bStart.getTime() && aEnd.getTime() === bEnd.getTime()) {
    return 'complete_overlap';
  } else if (aStart < bStart && aEnd > bEnd) {
    return 'contains';
  } else if (bStart < aStart && bEnd > aEnd) {
    return 'contained';
  } else {
    return 'partial_overlap';
  }
}

/**
 * Assess conflict severity
 */
function getConflictSeverity(eventA, eventB) {
  const hasAttendees = (eventA.attendees?.length > 0) || (eventB.attendees?.length > 0);
  const isImportant = eventA.summary?.toLowerCase().includes('meeting') || 
                     eventB.summary?.toLowerCase().includes('meeting') ||
                     eventA.summary?.toLowerCase().includes('interview') || 
                     eventB.summary?.toLowerCase().includes('interview');
  
  if (hasAttendees && isImportant) return 'high';
  if (hasAttendees || isImportant) return 'medium';
  return 'low';
}

/**
 * Generate AI-powered conflict resolution suggestions
 */
function generateConflictSuggestions(eventA, eventB) {
  const suggestions = [];
  
  // Time-based suggestions
  const duration = new Date(eventA.end.dateTime) - new Date(eventA.start.dateTime);
  suggestions.push(`Reschedule "${eventA.summary}" to start after "${eventB.summary}" ends`);
  suggestions.push(`Move "${eventB.summary}" to an earlier time slot`);
  
  // Priority-based suggestions
  if (eventA.attendees?.length > eventB.attendees?.length) {
    suggestions.push(`Prioritize "${eventA.summary}" (more attendees)`);
  } else if (eventB.attendees?.length > eventA.attendees?.length) {
    suggestions.push(`Prioritize "${eventB.summary}" (more attendees)`);
  }
  
  // Duration-based suggestions
  if (duration < 30 * 60 * 1000) { // Less than 30 minutes
    suggestions.push(`Consider combining short meetings or making "${eventA.summary}" a quick call`);
  }
  
  return suggestions.slice(0, 3); // Return top 3 suggestions
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
