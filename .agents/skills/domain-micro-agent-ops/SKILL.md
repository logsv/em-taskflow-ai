---
name: domain-micro-agent-ops
description: Operational procedures for managing, testing, and adding the 10 Engineering Manager (EM) domain micro-agents, 1-tool deterministic harnesses, multi-source MCP integrations, and policy guardrail validation in EM TaskFlow AI.
---

# Domain Micro-Agent Operational Skill

Use this skill when creating, modifying, testing, or auditing any of the 10 Engineering Manager domain micro-agents, deterministic tool harnesses, or LangGraph Supervisor routing policies.

---

## 📌 Architecture & Bounded Tool Policy

### 1. 1-Tool Bounding Policy
- Local Small Language Models (Ollama `hermes3:8b`) degrade in function-calling accuracy when exposed to multiple tools simultaneously.
- Each ReAct sub-agent is bound to **1 single tool definition**, elevating tool call accuracy past **95%**.

### 2. Base Agent Factory & Shared Utilities (`backend/src/agent/baseAgent.js`)
All domain micro-agents must use the standardized GoF Factory and utility functions from `baseAgent.js` to ensure zero code duplication and robust error handling:
- **`createMicroAgent({ name, defaultTool, promptTemplate, customTools, options })`**: Factory method initializing the LLM (with mock fallback for unit tests) and compiling the LangGraph ReAct agent.
- **`safeExecuteMCPTool(toolName, params, timeoutMs)`**: Standardized MCP tool execution with built-in safety timeout and resilient JSON string parsing.
- **`resolveGithubTarget(inputArgs)`**: Standardized resolver for GitHub owner, repo, and scoped identifiers.
- **`resolveMemberTarget(identifier, toolType)`**: Standardized resolver for team member identity across GitHub, Jira, Notion, and Google Calendar.
- **`createProvenanceNotice(isCached, syncedAt, liveSourceName)`**: Standardized provenance header builder for cached DB fallbacks.

### 3. Strict 3-Tier Separation of Concerns
Each domain micro-agent tool harness (`createDeterministicToolHarness`) must enforce a strict separation of concerns:
1. **Tier 1 (Live Tools - `mcpExecutors`)**: Executes live MCP tools via `safeExecuteMCPTool()` and integration clients. Never queries PostgreSQL directly in live executors.
2. **Tier 2 (PostgreSQL Fallback - `dbCacheFallback`)**: Queries `databaseService` (`taskflow_backend`) strictly when live tools time out or are unconfigured.
3. **Pure Domain Engine (`computeMath`)**: Calculates metrics, DORA tier ratings, SBI cards, and sprint allocations in pure business logic without network or database side-effects.

### 4. The 10 Domain Micro-Agents
- **`doraAgent`** $\rightarrow$ `calculate_dora_metrics`: DORA metrics from GitHub release/PR data, Jira incidents, and PostgreSQL snapshots.
- **`deliveryAgent`** $\rightarrow$ `analyze_delivery_bottlenecks`: Jira blocker tickets, GitHub PR turnaround, and delivery metrics.
- **`sbiAgent`** $\rightarrow$ `format_sbi_feedback`: Situation-Behavior-Impact coaching from Jira context, 1-on-1s, and Slack interactions.
- **`peopleAgent`** $\rightarrow$ `analyze_personnel_growth`: Career growth, 1-on-1 tracking, Google Calendar cadence, and Notion career ladders.
- **`sprintAgent`** $\rightarrow$ `calculate_sprint_plan`: Sprint capacity, story point velocity, Jira backlog, and Google Calendar PTO schedules.
- **`retroAgent`** $\rightarrow$ `generate_sprint_retro`: Thematic clustering over Notion retro boards, Jira issues, GitHub DORA events, and Slack channels (`#engineering-retro`).
- **`roadmapAgent`** $\rightarrow$ `get_roadmap_alignment`: Milestone alignment and drift detection across Jira Epics, GitHub milestones, and Notion roadmaps.
- **`okrAgent`** $\rightarrow$ `evaluate_okr_progress`: Quarterly OKR progress and pacing scores via Notion OKRs, Jira deliverables, and GitHub commits.
- **`sopAgent`** $\rightarrow$ `query_sop_compliance`: SOP compliance, ADR governance, architecture decision records, and review SLAs.
- **`criticAgent`** $\rightarrow$ `audit_em_report`: Auditing and critiquing draft EM reports, performance dossiers, and promotion packets.

---

## 🛡️ Coding Standards & Anti-Patterns (STRICT)

1. **Zero Silent Failures**:
   - Empty catch blocks (`catch (_e) {}`) are **strictly prohibited**.
   - Always log caught exceptions using structured leveled Pino logger (`warn({ module, action, err }, '...')`).
2. **No Duplicated Agent Boilerplate**:
   - Never write inline `createAgent()` or manual mock LLM fallback blocks. Always delegate to `createMicroAgent()`.
3. **Zero Direct DB Access in Live MCP Handlers**:
   - `mcpExecutors` must only invoke external integrations via `safeExecuteMCPTool()`. DB caching belongs exclusively in `dbCacheFallback`.
4. **Zero Hardcoded Fake Fallbacks**:
   - Fallbacks must use real PostgreSQL snapshots or domain-neutral indicators. Never return hardcoded placeholder usernames (`@logsv`) or fake ticket numbers.

---

## 🧪 Operational & Verification Commands

### 1. Test Domain Micro-Agent Harnesses via Node CLI
```bash
cd backend
node -e "import('./src/agent/doraAgent.js').then(async (m) => { console.log('DORA Harness:', await m.doraMetricsTool.invoke({})); });"
node -e "import('./src/agent/deliveryAgent.js').then(async (m) => { console.log('Delivery Harness:', await m.deliveryBottlenecksTool.invoke({})); });"
node -e "import('./src/agent/sbiAgent.js').then(async (m) => { console.log('SBI Harness:', await m.sbiFeedbackTool.invoke({ situation: 'unblocking code reviews' })); });"
node -e "import('./src/agent/peopleAgent.js').then(async (m) => { console.log('People Harness:', await m.peopleGrowthTool.invoke({ engineer_id: 'eng_alex' })); });"
```

### 2. Run Backend Unit Tests (342 Specs)
```bash
cd backend
npm test
```

