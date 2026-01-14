export async function formatDataForLLM(data) {
  const {
    jiraTasks,
    notionPages,
    calendarEvents,
    calendarConflicts,
  } = data || {};

  let result = 'Current Status Overview:\n\n';

  if (Array.isArray(jiraTasks) && jiraTasks.length > 0) {
    result += 'JIRA TASKS:\n';
    for (const task of jiraTasks) {
      const key = task.key;
      const summary = task.summary;
      const status = task.status;
      result += `[${key}] ${summary} - Status: ${status}\n`;
    }
    result += '\n';
  }

  if (Array.isArray(notionPages) && notionPages.length > 0) {
    result += 'NOTION PROJECTS:\n';
    for (const page of notionPages) {
      const title = page.title;
      const lastEdited = page.last_edited_time;
      result += `${title} (Last updated: ${lastEdited})\n`;
    }
    result += '\n';
  }

  if (Array.isArray(calendarEvents) && calendarEvents.length > 0) {
    result += "TODAY'S CALENDAR:\n";
    for (const event of calendarEvents) {
      const summary = event.summary;
      const start = event.start;
      const end = event.end;
      result += `${summary} (${start} - ${end})\n`;
    }
    result += '\n';
  }

  if (Array.isArray(calendarConflicts) && calendarConflicts.length > 0) {
    result += 'SCHEDULING CONFLICTS:\n';
    for (const pair of calendarConflicts) {
      if (!Array.isArray(pair) || pair.length < 2) {
        continue;
      }
      const a = pair[0];
      const b = pair[1];
      result += `"${a.summary}" conflicts with "${b.summary}"\n`;
    }
    result += '\n';
  }

  return result;
}

