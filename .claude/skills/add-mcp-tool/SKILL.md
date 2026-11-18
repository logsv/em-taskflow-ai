---
name: add-mcp-tool
description: Checklist for adding a new external integration tool (Jira, GitHub, Notion, Slack, Google Calendar, or a new provider) under backend/src/mcp/ and backend/src/integrations/clients/. Use when the user asks to add, expose or wire up a new MCP/integration tool or API call that agents should be able to invoke.
argument-hint: <provider> <tool_name> e.g. "jira jira_list_sprints"
---

# Add an MCP / Integration Tool

Arguments: `$ARGUMENTS`. Use `createNativeJiraTools()` in `backend/src/mcp/jira.js` as the reference.

## 1. HTTP lives in the client facade, never in the tool

Add a method to `backend/src/integrations/clients/<Provider>Client.js`, wrapped in `this.execute('<methodName>', async () => …)`. `BaseIntegrationClient` gives you timeouts, error normalisation and logging. **No raw axios/fetch** in `mcp/*.js`, agents or `settingsService.js`.

New provider? Create `<Provider>Client extends BaseIntegrationClient` with `testConnection()`, export it from `backend/src/integrations/index.js`, and read credentials from `settingsService` (never hard-code them).

## 2. Tool definition: `backend/src/mcp/<provider>.js`

```js
new DynamicStructuredTool({
  name: '<provider>_<verb>_<noun>',          // snake_case, provider-prefixed
  description: 'One sentence: what it returns and when to use it.',
  schema: z.object({ /* every field .describe()d, sensible .default()s */ }),
  func: async (args) => {
    try {
      const res = await <provider>Client.<method>(…);
      return JSON.stringify({ …normalised fields…, source: '<provider>_live_api' }, null, 2);
    } catch (err) {
      warn({ module: '<provider>MCP', action: '<tool_name>_error', err: err.message }, '…');
      return JSON.stringify({ status: 'UNAVAILABLE', service: '<provider>', reason: '…', message: `… ${err.message}` });
    }
  },
});
```

- Return **real data or an explicit `UNAVAILABLE` status**. Never return sample or placeholder records.
- Links: use `formatMarkdownLinkOrCode()` from `backend/src/utils/urlHelper.js`. Never invent domains or `#` anchors.
- **Write actions** (posting, creating, updating) must go through Temporal human approval (HITL), as `slack_post_message` does with `slackPostHITLWorkflow` in `backend/src/temporal/workflows.js`.

## 3. Registration

| File | Change |
|---|---|
| `backend/src/mcp/<provider>.js` | add to the array returned by `createNative<Provider>Tools()` |
| `backend/src/mcp/index.js` | new provider only: dynamic import + `loadTools(...)` + add to `mcpTools` and the `executeMCPTool` lookup chain |
| `backend/src/services/agentService.js` | add the tool name to the relevant `domainToolNames.<domain>` set, or the policy validator flags it as unexpected |
| consuming agent `backend/src/agent/<d>Agent.js` | call it from `mcpExecutors` via `safeExecuteMCPTool('<tool_name>', params)`. Do **not** bind it as a second agent tool (1-tool rule) |
| `backend/src/cache/toolCache.js` | read-only tools: make sure `getDefaultTtlSeconds` matches the name. Note: `toolCache` is currently **not** called on the execution path, so a TTL here has no effect until it is wired into `executeMCPTool` |
| `backend/src/services/domainRegistry.js` | list it under the provider's `mcpTools` |

## 4. Tests: `backend/test/mcp/<provider>.spec.js`

Stub the client method with sinon (`global.createMockSandbox()`), then assert: (a) the success shape and `source`; (b) a client error yields `status: 'UNAVAILABLE'` with no fabricated records; (c) schema defaults. See `backend/test/mcp/slack.spec.js`.

## 5. Verify

Run the `/verify` skill.
