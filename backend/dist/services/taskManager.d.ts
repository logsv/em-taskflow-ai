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
declare function fetchProjectPages(): Promise<ProjectPage[]>;
declare function updatePageStatus(pageId: string, note: string): Promise<boolean>;
declare function summarizePageUpdates(pageId: string): Promise<string[]>;
declare function fetchAssignedTasks(): Promise<TaskData[]>;
declare function fetchTodaysEvents(): Promise<CalendarEvent[]>;
declare function fetchAllStatus(): Promise<AllStatusData>;
declare function updateTaskStatus(taskId: string, status: string): Promise<boolean>;
declare function markTaskComplete(taskId: string): Promise<boolean>;
declare const detectConflicts: (events: CalendarEvent[]) => [CalendarEvent, CalendarEvent][];
declare const taskManager: {
    fetchAllStatus: typeof fetchAllStatus;
    fetchAssignedTasks: typeof fetchAssignedTasks;
    fetchProjectPages: typeof fetchProjectPages;
    fetchTodaysEvents: typeof fetchTodaysEvents;
    updateTaskStatus: typeof updateTaskStatus;
    updatePageStatus: typeof updatePageStatus;
    markTaskComplete: typeof markTaskComplete;
    detectConflicts: (events: CalendarEvent[]) => [CalendarEvent, CalendarEvent][];
    summarizePageUpdates: typeof summarizePageUpdates;
};
export default taskManager;
export { fetchAllStatus, fetchAssignedTasks, fetchProjectPages, fetchTodaysEvents, updateTaskStatus, updatePageStatus, markTaskComplete, detectConflicts, summarizePageUpdates };
//# sourceMappingURL=taskManager.d.ts.map