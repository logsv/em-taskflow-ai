# LangGraph Multi-Agent Supervisor

EM TaskFlow AI uses `@langchain/langgraph-supervisor` to orchestrate 10 specialized domain micro-agents. 

---

## 🎯 The 1-Tool Sub-Agent Bounding Rule

### The Problem with Local SLMs
Small Language Models (3B to 8B parameter models like `hermes3:8b` or `mistral:7b`) suffer significant cognitive degradation and hallucination when presented with large tool schemas ($>5$ tools simultaneously).

### The Solution: 1 Bounded Tool per Sub-Agent
Each micro-agent in EM TaskFlow AI is architected as a specialized ReAct agent bounded to **strictly 1 deterministic tool definition**. This increases function-calling accuracy from $<65\%$ on multi-tool prompts to **$>95\%$** on local SLMs.

---

## 👥 The 10 Domain Micro-Agents Catalog

| Agent Name | Bounded Tool Name | Primary Data Sources | Core Capabilities |
| :--- | :--- | :--- | :--- |
| **`doraAgent`** | `calculate_dora_metrics` | GitHub REST + Jira Incidents + DB | DORA 4 metrics (Deploy Frequency, Lead Time, Failure Rate, MTTR) with tier ratings. |
| **`deliveryAgent`** | `analyze_delivery_bottlenecks` | Jira JQL + GitHub PR turnaround | Review cycle times, commit counts, and Jira blocker tickets. |
| **`sbiAgent`** | `format_sbi_feedback` | Jira tickets + 1-on-1s + Slack | Situation-Behavior-Impact constructive coaching scripts. |
| **`peopleAgent`** | `analyze_personnel_growth` | Google Calendar + Notion ladders | Career progression, 1-on-1 cadence, and skill competency gaps. |
| **`sprintAgent`** | `calculate_sprint_plan` | Jira Backlog + Calendar PTOs | Sprint capacity estimation and story point velocity. |
| **`retroAgent`** | `generate_sprint_retro` | Notion Retro + Jira + Slack + GitHub | Thematic clustering (*What Went Well*, *Areas for Improvement*, *Action Items*). |
| **`roadmapAgent`** | `get_roadmap_alignment` | Jira Epics + GitHub Milestones + Notion | Milestone alignment, technical dependencies, and roadmap drift. |
| **`okrAgent`** | `evaluate_okr_progress` | Notion OKRs + Jira + Commits | Objectives & Key Results tracking and pacing scores. |
| **`sopAgent`** | `query_sop_compliance` | Notion Policies + ADRs + DB | Standard Operating Procedures, review SLAs, and ADR governance. |
| **`criticAgent`** | `audit_em_report` | Draft text + DB policies | Audits draft EM status reports, dossiers, and promotion packets. |

---

## 🛡️ Guardrails & Loop Prevention
The supervisor maintains state transition history. If an agent executes or transitions more than twice in a single turn without producing new information, the supervisor intercepts the cycle and forces final response synthesis.
