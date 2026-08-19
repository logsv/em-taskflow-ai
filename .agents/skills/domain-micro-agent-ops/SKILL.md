---
name: domain-micro-agent-ops
description: Operational procedures for managing, testing, and adding the 10 Engineering Manager (EM) domain micro-agents, 1-tool deterministic harnesses, and policy guardrail validation in EM TaskFlow AI.
---

# Domain Micro-Agent Operational Skill

Use this skill when creating, modifying, testing, or auditing any of the 10 Engineering Manager domain micro-agents, deterministic tool harnesses, or LangGraph Supervisor routing policies.

---

## 📌 Architecture & Bounded Tool Policy

1. **1-Tool Bounding Policy**:
   - Local Small Language Models (Ollama `hermes3:8b`) degrade in function-calling accuracy when exposed to multiple tools simultaneously.
   - Each ReAct sub-agent is bound to **1 single tool definition**, elevating tool call accuracy past **95%**.

2. **The 10 Domain Micro-Agents & Harnesses**:
   - `doraAgent` $\rightarrow$ `calculate_dora_metrics`
   - `deliveryAgent` $\rightarrow$ `analyze_delivery_bottlenecks`
   - `sbiAgent` $\rightarrow$ `format_sbi_feedback`
   - `peopleAgent` $\rightarrow$ `analyze_personnel_growth`
   - `sprintAgent` $\rightarrow$ `calculate_sprint_plan`
   - `retroAgent` $\rightarrow$ `generate_sprint_retro`
   - `roadmapAgent` $\rightarrow$ `get_roadmap_alignment`
   - `okrAgent` $\rightarrow$ `evaluate_okr_progress`
   - `sopAgent` $\rightarrow$ `query_sop_compliance`
   - `criticAgent` $\rightarrow$ `audit_em_report`

3. **`VALID_DOMAINS` Set & Policy Alignment**:
   - `agentService.js` maps each domain micro-agent to its tool names (`domainToolNames`) so `mapInvokedDomains()` and `validatePolicy()` validate execution without false `unexpected_domains` policy guardrail blocks.

4. **Zero Misleading Fallbacks Enforcement**:
   - All tool harnesses use PostgreSQL database snapshots (`github_issues`, `dora_snapshots`, `sprint_analytics`, `okr_tracker`) as real DB fallbacks if live MCP tools are offline or return 0 items.
   - System never outputs hardcoded generic placeholder strings (such as fake `@logsv` or fake GitHub issues on non-GitHub queries).

---

## 🧪 Operational & Verification Commands

### 1. Test All Domain Micro-Agent Harnesses via Node CLI
```bash
cd backend
node -e "import('./src/agent/doraAgent.js').then(async (m) => { console.log('DORA Harness:', await m.doraMetricsTool.invoke({})); });"
node -e "import('./src/agent/deliveryAgent.js').then(async (m) => { console.log('Delivery Harness:', await m.deliveryBottlenecksTool.invoke({})); });"
```

### 2. Run Backend Unit Tests (155 Specs)
```bash
cd backend
npm test
```
