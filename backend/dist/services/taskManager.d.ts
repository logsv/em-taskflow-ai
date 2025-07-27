interface ProjectPage {
    id: string;
    title: string;
    status?: string;
    last_edited_time: string;
}
interface TaskData {
    id: string;
    key?: string;
    summary: string;
    status: string;
    assignee?: string;
}
interface CalendarEvent {
    id: string;
    summary: string;
    start: string;
    end: string;
    description?: string;
}
interface AllStatusData {
    jiraTasks?: TaskData[];
    notionPages?: ProjectPage[];
    calendarEvents?: CalendarEvent[];
    calendarConflicts?: [CalendarEvent, CalendarEvent][];
}
declare const fetchProjectPages: () => Promise<ProjectPage[]>;
declare const updatePageStatus: (pageId: string, note: string) => Promise<boolean>;
declare const summarizePageUpdates: (pageId: string) => Promise<string[]>;
declare const fetchAllStatus: () => Promise<AllStatusData>;
declare const fetchAssignedTasks: () => Promise<TaskData[]>;
declare const fetchTodaysEvents: () => Promise<CalendarEvent[]>;
declare const updateTaskStatus: (taskId: string, status: string) => Promise<boolean>;
declare const markTaskComplete: (taskId: string) => Promise<boolean>;
declare const detectConflicts: (events: CalendarEvent[]) => [CalendarEvent, CalendarEvent][];
declare const taskManager: {
    fetchAllStatus: () => Promise<AllStatusData>;
    fetchAssignedTasks: () => Promise<TaskData[]>;
    fetchProjectPages: () => Promise<ProjectPage[]>;
    fetchTodaysEvents: () => Promise<CalendarEvent[]>;
    updateTaskStatus: (taskId: string, status: string) => Promise<boolean>;
    updatePageStatus: (pageId: string, note: string) => Promise<boolean>;
    markTaskComplete: (taskId: string) => Promise<boolean>;
    detectConflicts: (events: CalendarEvent[]) => [CalendarEvent, CalendarEvent][];
    summarizePageUpdates: (pageId: string) => Promise<string[]>;
};
export default taskManager;
export { fetchAllStatus, fetchAssignedTasks, fetchProjectPages, fetchTodaysEvents, updateTaskStatus, updatePageStatus, markTaskComplete, detectConflicts, summarizePageUpdates };
//# sourceMappingURL=taskManager.d.ts.map