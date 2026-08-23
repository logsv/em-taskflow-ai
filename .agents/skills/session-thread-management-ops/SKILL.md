---
name: session-thread-management-ops
description: Operational procedures for managing PostgreSQL multi-session persistence, chat threads, pagination, context menus, thread renaming, dynamic header extraction, and chat history state anchoring in EM TaskFlow AI.
---

# Session & Thread Management Operations Skill

Use this skill when developing, testing, or troubleshooting multi-session architecture, chat threads, sidebar session pagination, context menu actions (rename, delete, archive), or chat history optimization in EM TaskFlow AI.

---

## 📌 Architecture & Database Persistence

### 1. Database Schema (`taskflow_backend`)
- **`sessions`**: Tracks client session UUID, IP, User-Agent, `last_active_at`, and `active_thread_id`.
- **`chat_threads`**: Tracks thread UUIDs associated with sessions, custom `title`, `archived` flag, and timestamps.
- **`chat_messages`**: Stores user queries and assistant responses partitioned by `thread_id` with sequence indexing.

### 2. REST Endpoints (`backend/src/routes/api.js`)
- `GET /api/session`: Resolves or initializes session and active chat thread.
- `GET /api/sessions?page=1&limit=10`: Returns paginated session inventory with active thread titles and activity timestamps.
- `POST /api/sessions`: Creates a new session and initializes an active thread.
- `GET /api/sessions/:sessionId/threads`: Lists paginated chat threads for a given session.
- `POST /api/threads`: Creates a new chat thread under the current session.
- `POST /api/sessions/:sessionId/switch`: Switches the active thread for the specified session.
- `GET /api/threads/:threadId/messages`: Fetches chronological message history for a specific thread.

### 3. Smart Thread Header Derivation (`frontend/src/components/Sidebar.jsx`)
- Automatically cleans raw user queries by stripping markdown headers, attachment tags (`[Attachment: ...]`), and system executive context blocks (`# Document Executive Context:`).
- Derives a clean $\le 36$-character display title for new threads before manual rename.

### 4. Chat History State Anchoring (`backend/src/application/chat/ChatApplicationService.js`)
- Implements a sliding window over turn history:
  - Preserves the last 8 conversation turns verbatim.
  - Compresses earlier turns beyond 10 into a compact 2-line summary anchor (`[System Memory: Conversation Summary Anchor]`) to prevent LLM context bloat.

---

## 🧪 Operational & Verification Commands

### 1. Test Session & Thread API Endpoints
```bash
# List Sessions (Page 1)
curl -s "http://localhost:4000/api/sessions?page=1&limit=5"

# Resolve Current Session Context
curl -s http://localhost:4000/api/session
```

### 2. Run Session & Thread Unit Specs
```bash
cd backend
npx jasmine test/routes/sessionAndThreadsRoutes.spec.js test/application/sessionApplicationService.spec.js test/application/chatHistoryOptimization.spec.js
```

### 3. Run Full Backend Test Suite (233 Specs)
```bash
cd backend
npm test
```
