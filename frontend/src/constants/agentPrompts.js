/**
 * Comprehensive Agent Hint Prompts Catalog for EM TaskFlow AI
 * Covers all 10 Domain Micro-Agents + Engineering Knowledge RAG.
 */

export const AGENT_CATEGORIES = [
  { id: "featured", label: "Featured", icon: "🌟" },
  { id: "metrics_delivery", label: "Delivery & Metrics", icon: "📊" },
  { id: "people_coaching", label: "People & Coaching", icon: "👥" },
  { id: "planning_strategy", label: "Planning & OKRs", icon: "🎯" },
  { id: "governance_docs", label: "Governance & Docs", icon: "🛡️" }
];

export const FEATURED_AGENT_IDS = ["dora", "delivery", "sbi", "sprint"];

export const ALL_AGENT_PROMPTS = [
  // 1. DORA Metrics Agent
  {
    id: "dora",
    category: "metrics_delivery",
    icon: "📊",
    title: "DORA Metrics Audit",
    domain: "DORA",
    shortDescription: "Deployment frequency, lead time, MTTR & failure rates",
    text: "Analyze team DORA metrics for deployment frequency, lead time, and failure rate",
    hints: [
      "Calculate team DORA deployment frequency and lead time for changes over the last 30 days",
      "Show our 90-day DORA performance scorecard and identify change failure rate trends",
      "What is our Mean Time to Restore (MTTR) across recent production incidents in the last 7 days?"
    ]
  },

  // 2. Delivery & Bottlenecks Agent
  {
    id: "delivery",
    category: "metrics_delivery",
    icon: "🚀",
    title: "Delivery & WIP Bottlenecks",
    domain: "Delivery",
    shortDescription: "Stalled PRs, cycle time outliers & blocked tickets",
    text: "Check current sprint delivery bottlenecks, WIP limit violations, and blocked PRs",
    hints: [
      "Review the latest PRs for the backend repository. Are there any open for more than 3 days?",
      "What are the current blockers and WIP limit violations for the project in Jira?",
      "Identify cycle time outliers and stalled code reviews across our active sprint tickets"
    ]
  },

  // 3. SBI Coaching Feedback Agent
  {
    id: "sbi",
    category: "people_coaching",
    icon: "💬",
    title: "SBI Feedback Generator",
    domain: "SBI Coaching",
    shortDescription: "Situation-Behavior-Impact structured coaching & praise",
    text: "Draft an SBI coaching feedback for an engineer unblocking code reviews",
    hints: [
      "Format a Situation-Behavior-Impact (SBI) feedback report for senior dev turnaround delays",
      "Generate an SBI constructive coaching plan for an engineer who missed a database migration deadline",
      "Draft positive SBI recognition feedback for a tech lead who successfully led zero-downtime migration"
    ]
  },

  // 4. People & Career Growth Agent
  {
    id: "people",
    category: "people_coaching",
    icon: "🌱",
    title: "Personnel Growth & 1:1s",
    domain: "People",
    shortDescription: "Career ladders, promotion readiness & burnout checks",
    text: "Review 1-on-1 career progression notes and promotion readiness for our senior developer",
    hints: [
      "Assess technical skill competency gaps and 6-month development roadmap for Staff Engineer promotion",
      "Check 1:1 meeting history for burnout risk factors and workload imbalance indicators",
      "Generate a 1-on-1 coaching agenda for an engineer stepping into a project lead role"
    ]
  },

  // 5. Sprint Capacity & Planning Agent
  {
    id: "sprint",
    category: "planning_strategy",
    icon: "⚡",
    title: "Sprint Capacity Planning",
    domain: "Sprint",
    shortDescription: "Velocity estimation, story points & PTO adjustments",
    text: "Calculate team sprint velocity and capacity forecast for next sprint planning",
    hints: [
      "Formulate a sprint plan allocating 20% capacity to tech debt reduction considering 2 engineers on PTO",
      "Evaluate rolling 5-sprint velocity stability and recommend commitment points for next sprint",
      "Analyze historical velocity variance and suggest optimal story point commitment"
    ]
  },

  // 6. Sprint Retrospective Agent
  {
    id: "retro",
    category: "planning_strategy",
    icon: "🔄",
    title: "Sprint Retrospective",
    domain: "Retro",
    shortDescription: "Start/Stop/Continue synthesis & postmortem action items",
    text: "Generate a sprint retrospective summary and action item tracking for the recent release",
    hints: [
      "Synthesize team retro feedback to identify recurring complaints regarding flaky CI integration tests",
      "Formulate a blameless retrospective postmortem for the checkout service degradation incident",
      "Summarize top 3 process improvements and assign clear owners from sprint retro notes"
    ]
  },

  // 7. Roadmap Alignment Agent
  {
    id: "roadmap",
    category: "planning_strategy",
    icon: "🗺️",
    title: "Roadmap & Epic Alignment",
    domain: "Roadmap",
    shortDescription: "Quarterly milestones, slip dates & cross-team dependencies",
    text: "Check our quarterly feature milestone alignment and epic roadmap dependencies in Jira",
    hints: [
      "Identify roadmap drift and projected slip dates for the mobile architecture initiative",
      "Assess cross-team technical dependencies between core-auth and billing epics",
      "Evaluate critical path risk for Q4 product deliverables against engineering velocity"
    ]
  },

  // 8. OKR & KPI Tracker Agent
  {
    id: "okr",
    category: "planning_strategy",
    icon: "🎯",
    title: "OKR & KPI Scorecard",
    domain: "OKR / KPI",
    shortDescription: "KR confidence pacing, scorecard metrics & lagging alerts",
    text: "Evaluate quarterly engineering Objectives & Key Results (OKRs) and team KPI scorecards",
    hints: [
      "Evaluate our quarterly OKR progress on backend infrastructure resilience and test coverage",
      "Calculate OKR confidence pacing scores for our API latency reduction Key Result",
      "Generate an OKR status scorecard highlighting lagging Key Results and remediation steps"
    ]
  },

  // 9. SOP & Compliance Policy Agent
  {
    id: "sop",
    category: "governance_docs",
    icon: "📋",
    title: "SOP & Policy Compliance",
    domain: "SOP / Policy",
    shortDescription: "Incident playbooks, security SOPs & ADR compliance",
    text: "What is our company standard operating procedure for handling production security incidents?",
    hints: [
      "Check our Architecture Decision Record (ADR) on database-per-service isolation guidelines",
      "What is the mandatory code review SLA and PR approval checklist in our engineering guidelines?",
      "Summarize change management approval policy for major production releases"
    ]
  },

  // 10. EM Report Critic & Audit Agent
  {
    id: "critic",
    category: "governance_docs",
    icon: "🔍",
    title: "EM Report Audit & Critic",
    domain: "Critic",
    shortDescription: "Executive clarity review, risk blindspots & blind-angle audit",
    text: "Audit and critique our sprint delivery report for executive clarity and risk identification",
    hints: [
      "Audit this engineering status update for executive tone, missing metrics, and unaddressed risks",
      "Critique our post-incident review draft for blameless phrasing and concrete follow-up actions",
      "Review engineering OKR justification write-up and highlight weak evidence points"
    ]
  },

  // 11. Docs & RAG Knowledge Base Agent
  {
    id: "rag",
    category: "governance_docs",
    icon: "📚",
    title: "Engineering Docs & RAG",
    domain: "Docs / RAG",
    shortDescription: "Hybrid dense/sparse retrieval across internal engineering PDFs & wiki",
    text: "Search internal engineering documentation and uploaded PDFs for architecture guidelines",
    hints: [
      "Search uploaded PDF runbooks for on-call escalation and rollback procedures",
      "Summarize key architectural principles from our uploaded system architecture document",
      "Query engineering guidelines on semantic vector search and caching strategies"
    ]
  }
];
