# frontend/AGENTS.md

React 18 SPA built with Vite. Main app at `/`, Action Hub at `/actions`, Admin Portal at `/admin`. Background: `docs/frontend/`.

## Layout

| Path | Purpose |
|---|---|
| `src/services/apiClient.js` | The only place that calls the backend. Base path `/api/v1`, session token injection |
| `src/components/` | Pages and feature components (`Chat`, `Sidebar`, `ActionHubPage`, `AdminPage`, ...) |
| `src/components/admin/ui/` | Shared UI primitives (`Button`, `Badge`, `Card`, `Drawer`, `Table`, `Tabs`, ...) |
| `src/constants/agentPrompts.js` | Quick Actions (`⌘K`) workflow catalog |
| `src/index.css` | Design tokens (CSS variables on `:root`) |

## Commands

```bash
npm start        # dev server on :3000
npm run build    # must pass before every PR (there is no test script yet)
```

## Rules

- Call the backend only through `apiClient.js`. No `fetch`/`axios` in components.
- Use the CSS variables from `src/index.css`. No hard-coded hex colours or one-off spacing values.
- Reuse primitives from `components/admin/ui/` before creating a new component. Do not add a UI library.
- Show only real data from the API. No invented metrics, confidence scores or placeholder users.
- Keep the main chat view free of implementation detail (agent pickers, tool lists, chunk settings). Those belong in `DevSettingsModal.jsx` or `/admin`.
