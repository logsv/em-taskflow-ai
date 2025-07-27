interface JiraTask {
    key?: string;
    id?: string;
    summary: string;
    status: string;
}
interface NotionPage {
    title: string;
    last_edited_time: string;
}
interface CalendarEvent {
    summary: string;
    start: string;
    end: string;
}
interface IntegrationData {
    jiraTasks?: JiraTask[];
    notionPages?: NotionPage[];
    calendarEvents?: CalendarEvent[];
    calendarConflicts?: [CalendarEvent, CalendarEvent][];
}
/**
 * Formats data from all integrations into a readable summary for LLM processing
 */
declare function formatDataForLLM(data: IntegrationData): Promise<string>;
/**
 * Processes user input and generates AI-powered responses
 */
declare function processUserQuery(userInput: string): Promise<string>;
/**
 * Generates smart priority suggestions based on current workload
 */
declare function generateSmartSuggestions(): Promise<string>;
export { formatDataForLLM, processUserQuery, generateSmartSuggestions };
//# sourceMappingURL=summaryFormatter.d.ts.map