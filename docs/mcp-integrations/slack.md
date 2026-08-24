# Slack Web API Bot Setup

The Slack MCP tool enables searching past channel discussions, gathering team sentiment for sprint retrospectives, and drafting constructive coaching notes.

---

## 🛠️ Step-by-Step Configuration Guide

### 1. Create a Slack App
1. Go to [Slack API: Your Apps](https://api.slack.com/apps).
2. Click **Create New App** $\rightarrow$ **From scratch**.
3. Name it `EM TaskFlow AI` and choose your workspace.

### 2. Configure Bot Token Scopes
Under **Features** $\rightarrow$ **OAuth & Permissions**, add the following **Bot Token Scopes**:
- `channels:read` (View public channels)
- `channels:history` (View messages in public channels)
- `groups:history` (View messages in private channels the bot is invited to)
- `chat:write` (Send messages as the bot)
- `search:read` (Search workspace messages)

### 3. Install App to Workspace
1. Click **Install to Workspace** and click **Allow**.
2. Copy the **Bot User OAuth Token** (`xoxb-...`).

### 4. Configure Backend Environment
Add the token to [`backend/.env`](file:///Users/logsv/Documents/agent-dev/em-taskflow-ai/backend/.env):
```bash
SLACK_BOT_TOKEN=xoxb-your_bot_token
MCP_SLACK_ENABLED=true
```

---

## 🔧 Available Slack Tools

- **`slack_list_channels`**: Returns public/private channels available to the bot.
- **`slack_search_messages`**: Searches Slack message history by keywords.
- **`slack_post_message`**: Sends formatted messages to authorized channels.
