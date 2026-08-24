# Atlassian Jira OAuth 2.0 PKCE Setup

EM TaskFlow AI supports native Jira integration via **OAuth 2.0 with Proof Key for Code Exchange (PKCE)** and REST API tool definitions.

---

## 🛠️ Step-by-Step Configuration Guide

### 1. Create an Atlassian Developer App
1. Go to the [Atlassian Developer Console](https://developer.atlassian.com/console/myapps/).
2. Click **Create** $\rightarrow$ **OAuth 2.0 (3LO) integration**.
3. Set your App Name to `EM TaskFlow AI`.

### 2. Configure Permissions (Scopes)
Under **Permissions** $\rightarrow$ **Jira API**, add the following OAuth 2.0 scopes:
- `read:jira-work`
- `write:jira-work`
- `read:jira-user`
- `offline_access` *(required for automated token refresh)*

### 3. Set Authorization Callback URL
Under **Authorization**, set the callback URL:
```
http://localhost:4000/api/mcp/jira/oauth/callback
```

### 4. Configure Backend Environment
Add your Atlassian App Client ID and Secret to [`backend/.env`](file:///Users/logsv/Documents/agent-dev/em-taskflow-ai/backend/.env):
```bash
JIRA_CLIENT_ID=your_atlassian_client_id
JIRA_CLIENT_SECRET=your_atlassian_client_secret
JIRA_REDIRECT_URI=http://localhost:4000/api/mcp/jira/oauth/callback
```

### 5. Authorize Connection
1. Open the Admin Portal at `http://localhost:3000/admin`.
2. Navigate to **Settings** $\rightarrow$ **Jira Connection**.
3. Click **Connect Jira** to complete the OAuth authorization.

---

## 🔧 Available Jira Tools

- **`jira_search`**: Searches Jira issues via JQL (`jql`, `max_results`).
- **`jira_get_issue`**: Retrieves full issue metadata, comments, and changelogs (`issueIdOrKey`).
- **`jira_create_issue`**: Creates new issues or tasks in a specified project.
