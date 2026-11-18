/**
 * Test Fixtures: Seed data for in-memory database stores.
 * This data is ONLY used in test environments. Production code returns
 * explicit empty states when no real data is available.
 */

export function seedTeamMembers(databaseService) {
  databaseService.inMemoryTeamMembers = [
    {
      id: 'mem_alex',
      displayName: 'Alex Williams',
      email: 'alex.williams@company.internal',
      aliases: ['Alex', 'alexw', 'eng_alex', 'alex-dev99'],
      githubUsername: 'alex-dev99',
      jiraEmail: 'alex.williams@company.internal',
      gcalEmail: 'alex.williams@company.internal',
      notionName: 'Alex Williams',
      currentLevel: 'L4_MID',
      targetLevel: 'L5_SENIOR',
      track: 'INDIVIDUAL_CONTRIBUTOR',
      tenureMonths: 18,
    },
    {
      id: 'mem_sarah',
      displayName: 'Sarah Chen',
      email: 'sarah.chen@company.internal',
      aliases: ['Sarah', 'sarahc', 'eng_sarah', 'sarah-c'],
      githubUsername: 'sarah-c',
      jiraEmail: 'sarah.chen@company.internal',
      gcalEmail: 'sarah.chen@company.internal',
      notionName: 'Sarah Chen',
      currentLevel: 'L5_SENIOR',
      targetLevel: 'M1_EM',
      track: 'ENGINEERING_MANAGEMENT',
      tenureMonths: 36,
    },
    {
      id: 'mem_vikas',
      displayName: 'Vikas Kumar',
      email: 'vikas.kumar@company.internal',
      aliases: ['Vikas', 'vikask', 'eng_vikas', 'vikas-infra'],
      githubUsername: 'vikas-infra',
      jiraEmail: 'vikas.kumar@company.internal',
      gcalEmail: 'vikas.kumar@company.internal',
      notionName: 'Vikas Kumar',
      currentLevel: 'L5_SENIOR',
      targetLevel: 'L6_STAFF',
      track: 'INDIVIDUAL_CONTRIBUTOR',
      tenureMonths: 42,
    },
    {
      id: 'mem_elena',
      displayName: 'Elena Rostova',
      email: 'elena.rostova@company.internal',
      aliases: ['Elena', 'elenar', 'eng_elena'],
      githubUsername: 'elena-r',
      jiraEmail: 'elena.rostova@company.internal',
      gcalEmail: 'elena.rostova@company.internal',
      notionName: 'Elena Rostova',
      currentLevel: 'L3_JUNIOR',
      targetLevel: 'L4_MID',
      track: 'INDIVIDUAL_CONTRIBUTOR',
      tenureMonths: 8,
    },
    {
      id: 'mem_taylor',
      displayName: 'Taylor Morgan',
      email: 'taylor.morgan@company.internal',
      aliases: ['Taylor', 'taylorm', 'eng_taylor', '@taylor-dev', 'taylor-dev'],
      githubUsername: 'taylor-dev',
      jiraEmail: 'taylor.morgan@company.internal',
      gcalEmail: 'taylor.morgan@company.internal',
      notionName: 'Taylor Morgan',
      currentLevel: 'L4_MID',
      targetLevel: 'L5_SENIOR',
      track: 'INDIVIDUAL_CONTRIBUTOR',
      tenureMonths: 24,
    },
  ];
}

export function seedSprintAnalytics(databaseService) {
  databaseService.inMemorySprintAnalytics = [
    {
      id: 1,
      sprint_id: 'sprint_42',
      sprint_name: 'Sprint 42',
      total_points: 38,
      completed_points: 38,
      wip_count: 7,
      wip_limit: 5,
      blocked_tickets: [
        { key: 'ENG-104', summary: 'Database migration schema lock', blocked_by: 'ENG-99', days_blocked: 3.5 },
      ],
      missed_deadline_tickets: [
        { key: 'ENG-88', summary: 'OAuth token refresh bug', due_date: '2026-08-01', days_overdue: 5 },
      ],
      retro_action_items: [
        'Establish dedicated daily PR review window at 10 AM',
        'Automate CI check for PR labels',
      ],
      candidate_tickets: [
        { key: 'ENG-201', summary: 'Core Auth OAuth v2 token refresh pipeline', story_points: 5, assignee: 'Alex Williams', is_tech_debt: false },
        { key: 'ENG-204', summary: 'PostgreSQL connection pool & pgvector HNSW index tuning', story_points: 5, assignee: 'Sarah Chen', is_tech_debt: true },
        { key: 'ENG-208', summary: 'RAG single-pass Markdown streaming response optimization', story_points: 8, assignee: 'Alex Williams', is_tech_debt: false },
        { key: 'ENG-212', summary: 'Temporal durable workflow timeout retry policy hardening', story_points: 3, assignee: 'Vikas Kumar', is_tech_debt: true },
        { key: 'ENG-215', summary: 'LangGraph multi-agent supervisor domain policy validator', story_points: 5, assignee: 'Elena Rostova', is_tech_debt: false },
        { key: 'ENG-219', summary: 'Redis semantic vector cache invalidation hooks', story_points: 3, assignee: 'Sarah Chen', is_tech_debt: true },
        { key: 'ENG-222', summary: 'Admin Portal team member sync & role management tab', story_points: 5, assignee: 'Elena Rostova', is_tech_debt: false },
      ],
      created_at: new Date(),
    },
    {
      id: 2,
      sprint_id: 'sprint_41',
      sprint_name: 'Sprint 41',
      total_points: 34,
      completed_points: 34,
      created_at: new Date(),
    },
    {
      id: 3,
      sprint_id: 'sprint_40',
      sprint_name: 'Sprint 40',
      total_points: 38,
      completed_points: 36,
      created_at: new Date(),
    },
    {
      id: 4,
      sprint_id: 'sprint_39',
      sprint_name: 'Sprint 39',
      total_points: 32,
      completed_points: 32,
      created_at: new Date(),
    },
    {
      id: 5,
      sprint_id: 'sprint_38',
      sprint_name: 'Sprint 38',
      total_points: 36,
      completed_points: 35,
      created_at: new Date(),
    },
  ];
}

export function seedDoraSnapshots(databaseService) {
  databaseService.inMemoryDoraSnapshots = [
    {
      id: 1,
      team_id: 'default',
      deployment_frequency: 3.2,
      lead_time_hours: 18.5,
      change_failure_rate: 4.2,
      mttr_hours: 1.8,
      period_start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      period_end: new Date(),
      created_at: new Date(),
    },
  ];
}

/**
 * OKR tracker rows (formerly a hard-coded "realistic OKR tree" inside okrAgent.js production code).
 * Shape mirrors the okr_tracker table returned by databaseService.getOkrRecords().
 */
export function buildOkrRecords(quarter = `Q${Math.ceil((new Date().getMonth() + 1) / 3)}`) {
  return [
    {
      id: 1,
      objective: 'O1: Elevate System Reliability & Operational Excellence',
      key_result: 'KR1: Maintain >99.9% API uptime across core gateway services',
      target_value: 99.9,
      current_value: 99.95,
      unit: '%',
      status: 'ON_TRACK',
      quarter,
      created_at: new Date(),
    },
    {
      id: 2,
      objective: 'O1: Elevate System Reliability & Operational Excellence',
      key_result: 'KR2: Reduce P95 API response latency to <150ms under peak load',
      target_value: 150,
      current_value: 138,
      unit: 'ms',
      status: 'ON_TRACK',
      quarter,
      created_at: new Date(),
    },
    {
      id: 3,
      objective: 'O2: Accelerate Engineering Delivery Velocity & Quality',
      key_result: 'KR3: Achieve >=85% unit and integration test coverage',
      target_value: 85,
      current_value: 60,
      unit: '%',
      status: 'AT_RISK',
      quarter,
      created_at: new Date(),
    },
    {
      id: 4,
      objective: 'O2: Accelerate Engineering Delivery Velocity & Quality',
      key_result: 'KR4: Decrease PR code review turnaround time to <12 hours',
      target_value: 12,
      current_value: 20,
      unit: 'hours',
      status: 'AT_RISK',
      quarter,
      created_at: new Date(),
    },
  ];
}

export function seedOkrRecords(databaseService, quarter) {
  databaseService.inMemoryOkrTracker = buildOkrRecords(quarter);
}

/**
 * Google Calendar source payload for the people agent (formerly a hard-coded
 * fallback schedule inside peopleAgent.js production code).
 */
export function buildCalendarSourceData({ weeklyMeetingHours = 12.0, attendee = 'Alex Williams' } = {}) {
  return {
    today_events: [
      { summary: `1-on-1 with Manager: ${attendee}`, start_time: '10:00 AM (Weekly)', attendee },
      { summary: 'Architecture Guild: Distributed Systems RFC', start_time: '2:00 PM (Bi-weekly)', attendee: 'team' },
    ],
    weekly_meeting_hours: weeklyMeetingHours,
    source: 'mcp_google_calendar',
    synced_at: new Date().toISOString(),
  };
}

export function seedGithubIssues(databaseService) {
  databaseService.inMemoryGithubIssues = [
    {
      id: 1,
      number: 42,
      title: 'feat: add temporal autonomous audit workflow',
      user: 'alex-dev',
      author: 'alex-dev',
      state: 'open',
      is_pull_request: true,
      created_at: new Date(Date.now() - 38.5 * 3600 * 1000).toISOString(),
      html_url: 'https://github.com/myorg/em-taskflow-ai/pull/42',
    },
    {
      id: 2,
      number: 45,
      title: 'fix: database per-service connection pool isolation',
      user: 'sarah-c',
      author: 'sarah-c',
      state: 'open',
      is_pull_request: true,
      created_at: new Date(Date.now() - 12 * 3600 * 1000).toISOString(),
      html_url: 'https://github.com/myorg/em-taskflow-ai/pull/45',
    },
  ];
}

const isoDaysFromNow = (days) => new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

/**
 * Raw Jira REST epics (the `fields` shape) for the roadmap agent. Dates are relative to "now"
 * so drift assertions stay deterministic. Formerly hard-coded ENG-201/205/210 epics lived in
 * roadmapAgent.js production code; they now exist only here.
 */
export function buildJiraRoadmapEpics() {
  return [
    {
      key: 'RM-1',
      fields: {
        summary: 'Overdue epic blocked upstream',
        status: { name: 'In Progress', statusCategory: { key: 'indeterminate' } },
        aggregateprogress: { percent: 40 },
        customfield_10016: 20,
        duedate: isoDaysFromNow(-6),
        created: isoDaysFromNow(-60),
        assignee: { displayName: 'Alex Williams' },
        issuelinks: [
          { type: { inward: 'is blocked by' }, inwardIssue: { key: 'RM-9', fields: { summary: 'Auth token API', status: { statusCategory: { key: 'indeterminate' } } } } },
          { type: { inward: 'is blocked by' }, inwardIssue: { key: 'RM-8', fields: { summary: 'Already shipped', status: { statusCategory: { key: 'done' } } } } },
        ],
      },
    },
    {
      key: 'RM-2',
      fields: {
        summary: 'Overdue epic with no blockers',
        status: { name: 'In Progress', statusCategory: { key: 'indeterminate' } },
        aggregateprogress: { percent: 70 },
        customfield_10016: 10,
        duedate: isoDaysFromNow(-3),
        created: isoDaysFromNow(-40),
        assignee: { displayName: 'Sarah Chen' },
      },
    },
    {
      key: 'RM-3',
      fields: {
        summary: 'Behind-schedule epic',
        status: { name: 'In Progress', statusCategory: { key: 'indeterminate' } },
        aggregateprogress: { percent: 10 },
        customfield_10016: 10,
        duedate: isoDaysFromNow(10),
        created: isoDaysFromNow(-90),
        assignee: null,
      },
    },
    {
      key: 'RM-4',
      fields: {
        summary: 'Completed epic',
        status: { name: 'Done', statusCategory: { key: 'done' } },
        aggregateprogress: { percent: 100 },
        customfield_10016: 5,
        duedate: isoDaysFromNow(-20),
        created: isoDaysFromNow(-80),
        assignee: { displayName: 'Vikas Kumar' },
      },
    },
    {
      key: 'RM-5',
      fields: {
        summary: 'Unestimated epic without a due date',
        status: { name: 'To Do', statusCategory: { key: 'new' } },
      },
    },
  ];
}

/** Retro harness source results built from Slack, GitHub, Jira and past sprint_analytics retro items. */
export function buildRetroSourceResults({ sprintName = 'Sprint 50' } = {}) {
  return {
    default: {
      tierUsed: 'TIER_1_MCP',
      data: {
        sprint_id: 'sprint_50',
        sprint_name: sprintName,
        team_members: ['Alex Williams', 'Sarah Chen'],
        past_retros: [
          { sprint_id: 'sprint_49', sprint_name: 'Sprint 49', items: ['Fix flaky checkout integration tests in CI'] },
          { sprint_id: 'sprint_48', sprint_name: 'Sprint 48', items: [{ task: 'Quarantine flaky e2e tests' }, 'Add PR review rotation'] },
          { sprint_id: 'sprint_47', sprint_name: 'Sprint 47', items: [] },
        ],
        synced_at: new Date().toISOString(),
      },
    },
    slack: {
      tierUsed: 'TIER_1_MCP',
      data: {
        channel: '#engineering-retro',
        source: 'mcp_slack',
        messages: [
          { user: 'sarah-c', text: 'Kudos to the infra pod for the smooth database cutover' },
          { user: 'alex-dev99', text: 'Flaky payment tests kept failing the pipeline again' },
          { user: 'taylor-dev', text: 'Lunch order is at noon' },
        ],
      },
    },
    github: {
      tierUsed: 'TIER_1_MCP',
      data: { pr_turnaround_hours: 9.5, total_prs_merged: 23, source: 'mcp_github' },
    },
    jira: {
      tierUsed: 'TIER_1_MCP',
      data: {
        total_incidents_reported: 2,
        recent_incidents: [
          { key: 'OPS-11', summary: 'Checkout latency spike', status: 'In Progress' },
          { key: 'OPS-10', summary: 'Login 500s', status: 'Resolved' },
        ],
        source: 'mcp_jira',
      },
    },
  };
}

/**
 * Seeds ALL in-memory stores with test fixture data.
 * Call this in test setup to provide baseline data for agent tool execution.
 */
export function seedAllTestData(databaseService) {
  seedTeamMembers(databaseService);
  seedSprintAnalytics(databaseService);
  seedDoraSnapshots(databaseService);
  seedOkrRecords(databaseService);
  seedGithubIssues(databaseService);
}
