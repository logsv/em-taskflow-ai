import { formatDataForLLM } from '../../src/services/summaryFormatter.js';

describe('Summary Formatter', () => {
  describe('formatDataForLLM', () => {
    it('should format empty data correctly', async () => {
      const result = await formatDataForLLM({});
      
      expect(result).toBe('Current Status Overview:\n\n');
    });

    it('should format Jira tasks correctly', async () => {
      const data = {
        jiraTasks: [
          { key: 'TASK-1', summary: 'Fix bug in login', status: 'In Progress' },
          { key: 'TASK-2', summary: 'Add new feature', status: 'To Do' }
        ]
      };

      const result = await formatDataForLLM(data);

      expect(result).toContain('JIRA TASKS:');
      expect(result).toContain('[TASK-1] Fix bug in login - Status: In Progress');
      expect(result).toContain('[TASK-2] Add new feature - Status: To Do');
    });

    it('should format Notion pages correctly', async () => {
      const data = {
        notionPages: [
          { title: 'Project Alpha', last_edited_time: '2023-01-01' },
          { title: 'Meeting Notes', last_edited_time: '2023-01-02' }
        ]
      };

      const result = await formatDataForLLM(data);

      expect(result).toContain('NOTION PROJECTS:');
      expect(result).toContain('Project Alpha (Last updated: 2023-01-01)');
      expect(result).toContain('Meeting Notes (Last updated: 2023-01-02)');
    });

    it('should format calendar events correctly', async () => {
      const data = {
        calendarEvents: [
          { summary: 'Team Meeting', start: '09:00', end: '10:00' },
          { summary: 'Client Call', start: '14:00', end: '15:00' }
        ]
      };

      const result = await formatDataForLLM(data);

      expect(result).toContain('TODAY\'S CALENDAR:');
      expect(result).toContain('Team Meeting (09:00 - 10:00)');
      expect(result).toContain('Client Call (14:00 - 15:00)');
    });

    it('should format calendar conflicts correctly', async () => {
      const event1 = { summary: 'Meeting A', start: '09:00', end: '10:00' };
      const event2 = { summary: 'Meeting B', start: '09:30', end: '10:30' };
      
      const data = {
        calendarConflicts: [[event1, event2] as [typeof event1, typeof event2]]
      };

      const result = await formatDataForLLM(data);

      expect(result).toContain('SCHEDULING CONFLICTS:');
      expect(result).toContain('"Meeting A" conflicts with "Meeting B"');
    });

    it('should format all data types together', async () => {
      const data = {
        jiraTasks: [
          { key: 'TASK-1', summary: 'Test task', status: 'Done' }
        ],
        notionPages: [
          { title: 'Test Page', last_edited_time: '2023-01-01' }
        ],
        calendarEvents: [
          { summary: 'Test Event', start: '10:00', end: '11:00' }
        ],
        calendarConflicts: [[
          { summary: 'Event A', start: '10:00', end: '11:00' },
          { summary: 'Event B', start: '10:30', end: '11:30' }
        ] as [{ summary: string; start: string; end: string; }, { summary: string; start: string; end: string; }]]
      };

      const result = await formatDataForLLM(data);

      expect(result).toContain('JIRA TASKS:');
      expect(result).toContain('NOTION PROJECTS:');
      expect(result).toContain('TODAY\'S CALENDAR:');
      expect(result).toContain('SCHEDULING CONFLICTS:');
      expect(result).toContain('[TASK-1] Test task - Status: Done');
      expect(result).toContain('Test Page (Last updated: 2023-01-01)');
      expect(result).toContain('Test Event (10:00 - 11:00)');
      expect(result).toContain('"Event A" conflicts with "Event B"');
    });

    it('should handle empty arrays correctly', async () => {
      const data = {
        jiraTasks: [],
        notionPages: [],
        calendarEvents: [],
        calendarConflicts: []
      };

      const result = await formatDataForLLM(data);

      expect(result).toBe('Current Status Overview:\n\n');
      expect(result).not.toContain('JIRA TASKS:');
      expect(result).not.toContain('NOTION PROJECTS:');
      expect(result).not.toContain('TODAY\'S CALENDAR:');
      expect(result).not.toContain('SCHEDULING CONFLICTS:');
    });

    it('should handle undefined arrays correctly', async () => {
      const data = {
        jiraTasks: undefined,
        notionPages: undefined,
        calendarEvents: undefined,
        calendarConflicts: undefined
      };

      const result = await formatDataForLLM(data);

      expect(result).toBe('Current Status Overview:\n\n');
    });

    it('should handle mixed defined and undefined data', async () => {
      const data = {
        jiraTasks: [{ key: 'TASK-1', summary: 'Test', status: 'Open' }],
        notionPages: undefined,
        calendarEvents: [],
        calendarConflicts: undefined
      };

      const result = await formatDataForLLM(data);

      expect(result).toContain('JIRA TASKS:');
      expect(result).toContain('[TASK-1] Test - Status: Open');
      expect(result).not.toContain('NOTION PROJECTS:');
      expect(result).not.toContain('TODAY\'S CALENDAR:');
      expect(result).not.toContain('SCHEDULING CONFLICTS:');
    });

    it('should handle tasks without keys', async () => {
      const data = {
        jiraTasks: [
          { summary: 'Task without key', status: 'In Progress' }
        ]
      };

      const result = await formatDataForLLM(data);

      expect(result).toContain('JIRA TASKS:');
      expect(result).toContain('[undefined] Task without key - Status: In Progress');
    });

    it('should preserve formatting and newlines', async () => {
      const data = {
        jiraTasks: [{ key: 'TASK-1', summary: 'Test', status: 'Open' }]
      };

      const result = await formatDataForLLM(data);

      expect(result.startsWith('Current Status Overview:\n\n')).toBe(true);
      expect(result).toContain('JIRA TASKS:\n');
      expect(result.endsWith('\n\n')).toBe(true);
    });
  });
});