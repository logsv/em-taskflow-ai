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

export function seedOkrRecords(databaseService) {
  const quarter = `Q${Math.ceil((new Date().getMonth() + 1) / 3)}`;
  databaseService.inMemoryOkrTracker = [
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
      objective: 'O2: Accelerate Engineering Delivery Velocity & Quality',
      key_result: 'KR3: Achieve >=85% unit and integration test coverage',
      target_value: 85,
      current_value: 78,
      unit: '%',
      status: 'AT_RISK',
      quarter,
      created_at: new Date(),
    },
  ];
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
}
