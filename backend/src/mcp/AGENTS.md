# backend/src/mcp/AGENTS.md

Tools for Jira, Notion, GitHub, Slack and Google Calendar. HTTP clients are in `backend/src/integrations/clients/`. Background: `docs/mcp-integrations/`.

## Rules

- **All external HTTP goes through a client** that extends `BaseIntegrationClient` (`integrations/clients/`). No raw `axios`/`fetch` in tools, agents or `settingsService.js`.
- **Agent-facing tools use `createDeterministicToolHarness()`** in `baseToolHarness.js` (feature flag, schema validation, tracing, fallback). Do not write a parallel harness.
- **OAuth files come in threes:** `<name>.js` (tools), `<name>OAuth.js` (flow), `<name>OAuthProvider.js` (token storage). Follow the Jira files when adding one.
- **Slack writes need human approval.** `slack_post_message` goes through the Temporal `slackPostHITLWorkflow`. Reads run directly. Never add a write path that skips approval.
- **Links:** use `backend/src/utils/urlHelper.js`. Use the provider's real URL, or format as plain code (`` `ENG-104` ``) via `formatMarkdownLinkOrCode()`. Never invent domains or `#` links.
- **Credential tests fail loudly** with the real HTTP status (e.g. 401). Never return mock success.
- **Settings:** a masked `******` value keeps the stored secret. Never clear `app_settings`.

## Tests

```bash
cd backend
npx jasmine --config=jasmine.json test/mcp/baseToolHarness.spec.js test/mcp/slack.spec.js
```

New integrations follow the `add-mcp-integration` skill.
