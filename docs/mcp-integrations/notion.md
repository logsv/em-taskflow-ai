# Notion REST API & OAuth Setup

EM TaskFlow AI integrates with Notion to query engineering handbooks, SOP policies, career progression ladders, and retrospective boards.

---

## 🛠️ Step-by-Step Configuration Guide

### Option A: Internal Integration Token (Recommended for Self-Hosting)
1. Go to [Notion Integrations](https://www.notion.so/my-integrations).
2. Click **New integration** and select your workspace.
3. Name it `EM TaskFlow AI` and grant **Read content**, **Update content**, and **Insert content** capabilities.
4. Copy the **Internal Integration Secret**.
5. In Notion, open the root workspace pages you want the assistant to access (e.g. Engineering Wiki, OKRs, Career Ladder), click **...** $\rightarrow$ **Connections** $\rightarrow$ **Connect to EM TaskFlow AI**.
6. Add token to [`backend/.env`](file:///Users/logsv/Documents/agent-dev/em-taskflow-ai/backend/.env):
   ```bash
   NOTION_API_KEY=secret_your_notion_api_key
   MCP_NOTION_ENABLED=true
   ```

---

## 🔧 Available Notion Tools

- **`notion_search`**: Searches workspace pages and databases by query text.
- **`notion_get_page`**: Fetches page blocks, properties, and formatted body text.
- **`notion_query_database`**: Queries structured Notion databases with filtering and sorting.
