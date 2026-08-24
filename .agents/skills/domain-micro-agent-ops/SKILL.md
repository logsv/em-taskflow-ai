---
name: domain-micro-agent-ops
description: Operational procedures for managing, testing, and adding the 10 Engineering Manager (EM) domain micro-agents, 1-tool deterministic harnesses, multi-source MCP integrations, and policy guardrail validation in EM TaskFlow AI.
---

# Domain Micro-Agent Operational Skill

Use this skill when creating, modifying, testing, or auditing any of the 10 Engineering Manager domain micro-agents, deterministic tool harnesses, or LangGraph Supervisor routing policies.

---

## 📌 Architecture & Bounded Tool Policy

1. **1-Tool Bounding Policy**:
   - Local Small Language Models (Ollama `hermes3:8b`) degrade in function-calling accuracy when exposed to multiple tools simultaneously.
   - Each ReAct sub-agent is bound to **1 single tool definition**, elevating tool call accuracy past **95%**.

2. **The 10 Domain Micro-Agents & Multi-Source MCP Integrations**:
   - **`doraAgent`** $\rightarrow$ `calculate_dora_metrics`: Computes DORA metrics using GitHub commit/release data, Jira incidents, and PostgreSQL snapshots.
   - **`deliveryAgent`** $\rightarrow$ `analyze_delivery_bottlenecks`: Analyzes commit velocity, PR turnaround, and Jira blocker tickets.
   - **`sbiAgent`** $\rightarrow$ `format_sbi_feedback`: Formats Situation-Behavior-Impact feedback from Jira ticket context, 1-on-1s, and Slack interactions.
   - **`peopleAgent`** $\rightarrow$ `analyze_personnel_growth`: Evaluates career growth, 1-on-1 cadence via Google Calendar, and Notion career ladders.
   - **`sprintAgent`** $\rightarrow$ `calculate_sprint_plan`: Synthesizes Jira sprint backlog, GitHub PRs, and Google Calendar PTO schedules.
   - **`retroAgent`** $\rightarrow$ `generate_sprint_retro`: Performs thematic clustering (*What Went Well*, *Areas for Improvement*, *Action Items*) over Notion retro boards, Jira issues, GitHub DORA events, and Slack discussions.
   - **`roadmapAgent`** $\rightarrow$ `get_roadmap_alignment`: Evaluates milestone alignment and roadmap drift using Jira Epics, GitHub milestones, and Notion roadmaps.
   - **`okrAgent`** $\rightarrow$ `evaluate_okr_progress`: Tracks quarterly OKR pacing scores and KPI progress from Notion OKRs, Jira deliverables, and GitHub commits.
   - **`sopAgent`** $\rightarrow$ `query_sop_compliance`: Queries SOP compliance, ADR governance, architecture decision records, and review SLAs.
   - **`criticAgent`** $\rightarrow$ `audit_em_report`: Audits and critiques draft EM status reports, dossiers, and promotion nomination packets.

3. **`VALID_DOMAINS` Set & Policy Alignment**:
   - `agentService.js` maps each domain micro-agent to its tool names (`domainToolNames`) so `mapInvokedDomains()` and `validatePolicy()` validate execution without false `unexpected_domains` policy guardrail blocks.

4. **Zero Misleading Fallbacks Enforcement**:
   - All tool harnesses use PostgreSQL database snapshots (`github_issues`, `dora_snapshots`, `sprint_analytics`, `okr_records`, `team_members`) as real DB fallbacks if live MCP tools are offline or return 0 items.
   - System never outputs hardcoded generic placeholder strings (such as fake `@logsv` or fake GitHub issues on non-GitHub queries).

---

## 🧪 Operational & Verification Commands

### 1. Test Domain Micro-Agent Harnesses via Node CLI
```bash
cd backend
node -e "import('./src/agent/doraAgent.js').then(async (m) => { console.log('DORA Harness:', await m.doraMetricsTool.invoke({})); });"
node -e "import('./src/agent/deliveryAgent.js').then(async (m) => { console.log('Delivery Harness:', await m.deliveryBottlenecksTool.invoke({})); });"
node -e "import('./src/agent/retroAgent.js').then(async (m) => { console.log('Retro Harness:', await m.sprintRetroTool.invoke({})); });"
node -e "import('./src/agent/okrAgent.js').then(async (m) => { console.log('OKR Harness:', await m.okrProgressTool.invoke({})); });"
```

### 2. Run Backend Unit Tests (233 Specs)
```bash
cd backend
npm test
```
