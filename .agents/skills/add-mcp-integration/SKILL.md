---
name: add-mcp-integration
description: Use when adding a new external integration (a new SaaS API), adding a tool to an existing integration (Jira, Notion, GitHub, Slack, Google Calendar), or adding an OAuth flow.
---

# Add an MCP integration or tool

Read `backend/src/mcp/AGENTS.md` first. Use the Jira files as the reference implementation.

## New integration

1. **Client**: `backend/src/integrations/clients/<Name>Client.js` extending `BaseIntegrationClient`. Include `testConnection()` that returns the real HTTP status on failure. Export it from `backend/src/integrations/index.js`.
2. **Tools**: `backend/src/mcp/<name>.js`. Tools call the client only; no raw HTTP.
3. **Register**: add the dynamic import and tool group in `backend/src/mcp/index.js` (follow the existing `jiraModule` / `slackModule` pattern, including the `.catch` that logs a warning).
4. **OAuth (if needed)**: `<name>OAuth.js` (flow, PKCE where the provider supports it) and `<name>OAuthProvider.js` (token storage), plus routes in `backend/src/routes/v1/index.js` (see the `/mcp/jira/oauth/*` routes).
5. **Settings**: add the credential fields in `backend/src/services/settingsService.js`. A masked `******` value must keep the stored secret. Never log tokens.
6. **Write actions** (posting, creating, deleting in the external system): require human approval through Temporal, like `slackPostHITLWorkflow` in `backend/src/temporal/workflows.js`.
7. **Tests**: `backend/test/mcp/<name>.spec.js` with the HTTP client mocked. Cover success, 401, timeout, and the fallback.
8. **Docs**: one page in `docs/mcp-integrations/`.

## New tool on an existing integration

Add the method to the existing client, then the tool in `backend/src/mcp/<name>.js`, then a spec. If an agent should use it, the agent still gets **one** tool. Wire it through that agent's harness executors; do not add a second tool to the agent.

## Verify

```bash
cd backend && npx jasmine --config=jasmine.json test/mcp/<name>.spec.js && npm test
```
