/**
 * Engineering Workflows Catalog for EM TaskFlow AI
 * "Workflows are the product; agents are the implementation."
 */

export const WORKFLOW_CATEGORIES = [
  { id: "all", label: "All" },
  { id: "multi-agent", label: "Multi-Agent" },
  { id: "delivery", label: "Delivery" },
  { id: "people", label: "People" },
  { id: "planning", label: "Planning" },
  { id: "governance", label: "Governance" }
];

// Backwards compatibility alias
export const AGENT_CATEGORIES = WORKFLOW_CATEGORIES;

export const FEATURED_WORKFLOW_IDS = ["team-health-audit", "dora", "delivery", "sbi", "people", "sprint"];
export const FEATURED_AGENT_IDS = FEATURED_WORKFLOW_IDS;

export const ALL_WORKFLOWS = [
  // 0. Multi-Agent Composite Workflows (Tier 5 Parallel Fan-Out/Fan-In)
  {
    id: "team-health-audit",
    category: "multi-agent",
    icon: "⚡",
    title: "Full Team Health Audit",
    domain: "Multi-Agent",
    shortDescription: "Parallel audit of DORA metrics, delivery bottlenecks & SBI coaching",
    text: "Evaluate overall engineering health: calculate team DORA metrics, check active delivery bottlenecks, and draft an SBI coaching feedback for the on-call lead",
    keywords: ["multi-agent", "composite", "health", "audit", "dora", "delivery", "sbi", "bottleneck", "coaching", "overview", "all-in-one"],
    hints: [
      "Evaluate team health: calculate DORA metrics, check delivery bottlenecks, and draft an SBI coaching feedback",
      "Run full engineering health scorecard across DORA deployment frequency, active PR stalls, and 1-on-1 career progression",
      "Audit sprint performance, inspect Jira blockers, and formulate an SBI growth plan for the team lead"
    ]
  },
  {
    id: "sprint-okr-alignment",
    category: "multi-agent",
    icon: "🎯",
    title: "Sprint & OKR Alignment",
    domain: "Multi-Agent",
    shortDescription: "Cross-domain review of sprint capacity, OKR pacing & roadmap drift",
    text: "Evaluate active sprint capacity velocity, quarterly OKR pacing scores, and roadmap milestone drift",
    keywords: ["multi-agent", "sprint", "okr", "roadmap", "pacing", "capacity", "milestone", "drift", "planning"],
    hints: [
      "Check active sprint commitment against Q4 engineering OKR pacing scores and epic delivery timelines",
      "Analyze sprint capacity velocity stability and cross-team roadmap dependencies in Jira",
      "Evaluate quarterly OKRs and forecast sprint commitment points for the next milestone"
    ]
  },
  {
    id: "promotion-governance",
    category: "multi-agent",
    icon: "🛡️",
    title: "Promotion & SOP Audit",
    domain: "Multi-Agent",
    shortDescription: "Evaluate engineer promotion readiness and audit against SOP guidelines",
    text: "Review 1-on-1 career progression notes and promotion readiness for our senior developer, and audit draft feedback against engineering SOP",
    keywords: ["multi-agent", "people", "sop", "critic", "promotion", "readiness", "governance", "career", "audit"],
    hints: [
      "Assess engineer promotion readiness across 12 dimensions and audit performance dossier against SOP standards",
      "Review 1:1 meeting career notes and check compliance with engineering career ladder guidelines",
      "Evaluate senior dev promotion packet and audit for objective tone and zero vanity metrics"
    ]
  },
  // 1. DORA Metrics Workflow
  {
    id: "dora",
    category: "delivery",
    icon: "📊",
    title: "DORA Metrics Audit",
    domain: "DORA",
    shortDescription: "Deployment frequency, lead time, MTTR & failure rate",
    text: "Analyze team DORA metrics for deployment frequency, lead time, and failure rate",
    keywords: ["dora", "metrics", "deployment", "frequency", "lead time", "mttr", "failure rate", "production", "slipping", "performance", "throughput"],
    hints: [
      "Calculate team DORA deployment frequency and lead time for changes over the last 30 days",
      "Show our 90-day DORA performance scorecard and identify change failure rate trends",
      "What is our Mean Time to Restore (MTTR) across recent production incidents in the last 7 days?"
    ]
  },

  // 2. Delivery & Bottlenecks Workflow
  {
    id: "delivery",
    category: "delivery",
    icon: "🚀",
    title: "Delivery Bottleneck Analysis",
    domain: "Delivery",
    shortDescription: "Identify blocked work, WIP and cycle-time issues",
    text: "Check current sprint delivery bottlenecks, WIP limit violations, and blocked PRs",
    keywords: ["bottleneck", "delivery", "slipping", "blocked", "wip", "prs", "cycle time", "stalled", "review", "delays", "turnaround"],
    hints: [
      "Review the latest PRs for the backend repository. Are there any open for more than 3 days?",
      "What are the current blockers and WIP limit violations for the project in Jira?",
      "Identify cycle time outliers and stalled code reviews across our active sprint tickets"
    ]
  },

  // 3. SBI Coaching Feedback Workflow
  {
    id: "sbi",
    category: "people",
    icon: "💬",
    title: "SBI Feedback Generator",
    domain: "SBI Coaching",
    shortDescription: "Draft Situation-Behavior-Impact coaching & recognition",
    text: "Draft an SBI coaching feedback for an engineer unblocking code reviews",
    keywords: ["sbi", "feedback", "coaching", "praise", "recognition", "performance", "situation", "behavior", "impact", "people", "1-on-1"],
    hints: [
      "Format a Situation-Behavior-Impact (SBI) feedback report for senior dev turnaround delays",
      "Generate an SBI constructive coaching plan for an engineer who missed a database migration deadline",
      "Draft positive SBI recognition feedback for a tech lead who successfully led zero-downtime migration"
    ]
  },

  // 4. People & Career Growth Workflow
  {
    id: "people",
    category: "people",
    icon: "🌱",
    title: "Personnel Growth & 1:1s",
    domain: "People",
    shortDescription: "Track career ladders, 1:1 cadence & burnout risks",
    text: "Review 1-on-1 career progression notes and promotion readiness for our senior developer",
    keywords: ["people", "1:1", "1-on-1", "career", "growth", "ladder", "promotion", "burnout", "tenure", "cadence", "sync", "readiness"],
    hints: [
      "Assess technical skill competency gaps and 6-month development roadmap for Staff Engineer promotion",
      "Check 1:1 meeting history for burnout risk factors and workload imbalance indicators",
      "Generate a 1-on-1 coaching agenda for an engineer stepping into a project lead role"
    ]
  },

  // 5. Sprint Capacity & Planning Workflow
  {
    id: "sprint",
    category: "planning",
    icon: "⚡",
    title: "Sprint Capacity Planning",
    domain: "Sprint",
    shortDescription: "Forecast sprint capacity, velocity & PTO adjustments",
    text: "Calculate team sprint velocity and capacity forecast for next sprint planning",
    keywords: ["sprint", "capacity", "velocity", "planning", "pto", "story points", "slipping", "forecast", "commitment", "backlog"],
    hints: [
      "Formulate a sprint plan allocating 20% capacity to tech debt reduction considering 2 engineers on PTO",
      "Evaluate rolling 5-sprint velocity stability and recommend commitment points for next sprint",
      "Analyze historical velocity variance and suggest optimal story point commitment"
    ]
  },

  // 6. Sprint Retrospective Workflow
  {
    id: "retro",
    category: "planning",
    icon: "🔄",
    title: "Sprint Retrospective",
    domain: "Retro",
    shortDescription: "Synthesize What Went Well, Improvements & Actions",
    text: "Generate a sprint retrospective summary and action item tracking for the recent release",
    keywords: ["retro", "retrospective", "postmortem", "action items", "improvements", "sprint", "what went well", "went well", "incident"],
    hints: [
      "Synthesize team retro feedback to identify recurring complaints regarding flaky CI integration tests",
      "Formulate a blameless retrospective postmortem for the checkout service degradation incident",
      "Summarize top 3 process improvements and assign clear owners from sprint retro notes"
    ]
  },

  // 7. Roadmap Alignment Workflow
  {
    id: "roadmap",
    category: "planning",
    icon: "🗺️",
    title: "Roadmap & Epic Alignment",
    domain: "Roadmap",
    shortDescription: "Quarterly milestones, slip dates & cross-team dependencies",
    text: "Check our quarterly feature milestone alignment and epic roadmap dependencies in Jira",
    keywords: ["roadmap", "epic", "milestone", "dependencies", "slipping", "slip", "drift", "quarterly", "jira", "deliverables"],
    hints: [
      "Identify roadmap drift and projected slip dates for the mobile architecture initiative",
      "Assess cross-team technical dependencies between core-auth and billing epics",
      "Evaluate critical path risk for Q4 product deliverables against engineering velocity"
    ]
  },

  // 8. OKR & KPI Scorecard Workflow
  {
    id: "okr",
    category: "planning",
    icon: "🎯",
    title: "OKR & KPI Scorecard",
    domain: "OKR / KPI",
    shortDescription: "Evaluate KR pacing, scorecards & lagging alerts",
    text: "Evaluate quarterly engineering Objectives & Key Results (OKRs) and team KPI scorecards",
    keywords: ["okr", "kpi", "scorecard", "key results", "objectives", "pacing", "confidence", "lagging", "goals", "metrics"],
    hints: [
      "Evaluate our quarterly OKR progress on backend infrastructure resilience and test coverage",
      "Calculate OKR confidence pacing scores for our API latency reduction Key Result",
      "Generate an OKR status scorecard highlighting lagging Key Results and remediation steps"
    ]
  },

  // 9. SOP & Policy Compliance Workflow
  {
    id: "sop",
    category: "governance",
    icon: "📋",
    title: "SOP & Policy Compliance",
    domain: "SOP / Policy",
    shortDescription: "Review incident playbooks, security policies & ADRs",
    text: "What is our company standard operating procedure for handling production security incidents?",
    keywords: ["sop", "compliance", "policy", "adr", "architecture", "security", "sla", "incident", "playbook", "review"],
    hints: [
      "Check our Architecture Decision Record (ADR) on database-per-service isolation guidelines",
      "What is the mandatory code review SLA and PR approval checklist in our engineering guidelines?",
      "Summarize change management approval policy for major production releases"
    ]
  },

  // 10. EM Report Audit & Critic Workflow
  {
    id: "critic",
    category: "governance",
    icon: "🔍",
    title: "EM Report Audit & Review",
    domain: "Critic",
    shortDescription: "Audit executive tone, blindspots & clarity in reports",
    text: "Audit and critique our sprint delivery report for executive clarity and risk identification",
    keywords: ["critic", "audit", "review", "report", "executive", "clarity", "blindspots", "dossier", "promotion", "communication"],
    hints: [
      "Audit this engineering status update for executive tone, missing metrics, and unaddressed risks",
      "Critique our post-incident review draft for blameless phrasing and concrete follow-up actions",
      "Review engineering OKR justification write-up and highlight weak evidence points"
    ]
  },

  // 11. Engineering Documentation Search Workflow
  {
    id: "rag",
    category: "governance",
    icon: "📚",
    title: "Engineering Docs & Guidelines",
    domain: "Docs",
    shortDescription: "Search internal runbooks, uploaded PDFs & wikis",
    text: "Search internal engineering documentation and uploaded PDFs for architecture guidelines",
    keywords: ["docs", "documentation", "rag", "pdf", "runbook", "wiki", "architecture", "guidelines", "knowledge", "search"],
    hints: [
      "Search uploaded PDF runbooks for on-call escalation and rollback procedures",
      "Summarize key architectural principles from our uploaded system architecture document",
      "Query engineering guidelines on semantic vector search and caching strategies"
    ]
  }
];

// Backwards compatibility alias
export const ALL_AGENT_PROMPTS = ALL_WORKFLOWS;

