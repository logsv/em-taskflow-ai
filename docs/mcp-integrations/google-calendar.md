# Google Calendar Dynamic ID Setup

The Google Calendar MCP tool powers sprint capacity planning (PTO schedules, company holidays) and 1-on-1 meeting tracking for the People micro-agent.

---

## 🛠️ Step-by-Step Configuration Guide

### 1. Enable Google Calendar API in Google Cloud
1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Select your project and navigate to **APIs & Services** $\rightarrow$ **Library**.
3. Search for **Google Calendar API** and click **Enable**.

### 2. Create API Credentials
1. Go to **APIs & Services** $\rightarrow$ **Credentials**.
2. Click **Create Credentials** $\rightarrow$ **API key** (or Service Account / OAuth 2.0 Client ID).
3. Restrict the key to Google Calendar API for production security.

### 3. Configure Backend Environment
Add the credentials to [`backend/.env`](file:///Users/logsv/Documents/agent-dev/em-taskflow-ai/backend/.env):
```bash
GOOGLE_API_KEY=your_google_api_key
GOOGLE_CALENDAR_ID=primary
MCP_GOOGLE_ENABLED=true
```

---

## 🔧 Available Google Calendar Tools

- **`get_calendar_events`**: Fetches events within a time window (e.g. `7d`, `14d`) for dynamic attendee emails or primary calendar.
- **`calendar_list_events`**: Detailed calendar event listing.
- **`calendar_create_event`**: Creates calendar invites for 1-on-1s or sprint reviews.
