# GitHub Scoped PAT & OAuth Setup

The GitHub MCP integration powers DORA metrics, pull request turnaround tracking, review cycle analysis, and issue synchronization.

---

## 🛠️ Step-by-Step Configuration Guide

### 1. Generate a Personal Access Token (PAT)
1. Go to **GitHub** $\rightarrow$ **Settings** $\rightarrow$ **Developer settings** $\rightarrow$ **Personal access tokens** $\rightarrow$ **Fine-grained tokens** (or Tokens classic).
2. Select scopes:
   - `repo` (Full control of private repositories: pull requests, commit statuses, issues)
   - `read:org` (Read organization and team membership)
3. Copy the token.

### 2. Configure Backend Environment
Add the token to [`backend/.env`](file:///Users/logsv/Documents/agent-dev/em-taskflow-ai/backend/.env):
```bash
GITHUB_TOKEN=ghp_your_github_token
MCP_GITHUB_ENABLED=true
```

---

## 🔧 Available GitHub Tools

- **`search_issues`**: Queries repository issues and pull requests via GitHub Search API.
- **`list_pull_requests`**: Lists open/merged pull requests with review comments, time-to-merge, and author stats.
- **`get_dora_events`**: Fetches release tags, deployment events, and merged PR timestamps for DORA metric calculations.
