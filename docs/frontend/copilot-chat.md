# 💬 Low-Distraction EM Copilot Chat Cockpit

The primary chat interface (`/`) is engineered for rapid management decision-making, offering high responsiveness and zero unnecessary LLM parameters.

---

## ⚡ Quick Actions Palette (`⌘K` / `Ctrl+K`)

Mounted in [`frontend/src/components/AgentPromptPalette.jsx`](file:///Users/logsv/Documents/agent-dev/em-taskflow-ai/frontend/src/components/AgentPromptPalette.jsx), the Quick Actions Palette allows engineering managers to instantly trigger complex domain workflows with a single keystroke.

### Workflow Domain Catalog
1. 🚀 **Delivery & Operations**:
   - *DORA 4 Metrics Calculation*: Computes Deployment Frequency, Lead Time for Changes, Change Failure Rate, and MTTR with state-of-devops tier ratings.
   - *PR Turnaround Bottlenecks*: Analyzes open pull requests waiting for review $>24\text{h}$ and identifies review queue stalls.
2. 👥 **People & Career Coaching**:
   - *SBI Feedback Formulation*: Drafts constructive Situation-Behavior-Impact coaching scripts based on real commit and ticket context.
   - *1-on-1 Cadence & Promotion Ladder*: Inspects Google Calendar sync frequency and assesses readiness for promotion cycles.
3. 🎯 **Planning & Execution**:
   - *Sprint Capacity & Pacing*: Calculates story point allocations with PTO deductions and 70/20/10 capacity splits.
   - *Milestone & Roadmap Alignment*: Cross-references Jira Epics and GitHub milestones against quarterly OKRs.
4. 🛡️ **Governance & Quality**:
   - *ADR & SOP Compliance Audit*: Audits review SLAs, database-per-service isolation, and security policies.
   - *Executive Report Critique*: Rigorously audits draft weekly status dossiers and promotion packets.

---

## 💊 Decision Action Pills

Assistant responses in the copilot chat automatically parse key decision outcomes and render interactive **Action Pills** inline:
- **`[📋 Open in EM Action Hub]`**: 1-click navigation to the `/actions` page pre-filtered to the referenced domain or severity.
- **`[🎯 Formulate Action Items]`**: Automatically extracts blockers into tracked, stateful items in PostgreSQL.
- **`[💬 Dispatch to Slack]`**: Launches the draft retrospective / briefing dispatch modal.

---

## 🗂️ Multi-Session Sidebar Cockpit (`Sidebar.jsx`)

- **Paginated Thread History**: Fetches sessions in chunks of 10 (`/api/v1/sessions?page=1&limit=10`) with infinite navigation.
- **Dynamic Thread Header Derivation**: Dynamically generates concise, scannable titles (`deriveShortHeader`) based on the initial user query.
- **Context Menu Operations**: 1-click inline session renaming, archiving, and deletion with instant UI state hydration.

---

## 🛠️ Developer Diagnostics Modal (`DevSettingsModal.jsx`)

To keep the primary chat viewport clean, technical controls are isolated inside the Developer Settings Modal:
- **Advanced RAG Mode Toggle**: Switches between standard fast-path inference and deep parent-child hybrid RAG synthesis.
- **Session & Thread ID Copying**: Diagnostic inspection of active PostgreSQL session UUIDs and thread identifiers.
- **Cache Flush Shortcuts**: 1-click targeted flushing of L1 exact in-memory, L2 Redis semantic, and Tier 2 tool caches.
