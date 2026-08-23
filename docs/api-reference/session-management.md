# Multi-Session Management & UI

EM TaskFlow AI features durable multi-session persistence backed by PostgreSQL (`taskflow_backend`), enabling persistent conversation browsing, deep linking, and context menu actions.

---

## 🗄️ Database Tables (`taskflow_backend`)

- **`sessions`**: `id` (UUID), `ip_address`, `user_agent`, `created_at`, `last_active_at`, `active_thread_id`.
- **`chat_threads`**: `id` (UUID), `session_id`, `title`, `archived` (boolean), `created_at`, `updated_at`.
- **`chat_messages`**: `id` (Serial), `thread_id`, `role` (`user` / `assistant`), `content`, `trace_id`, `metadata`, `created_at`.

---

## 🎨 Smart Header Derivation (`deriveShortHeader`)

When a user initiates a conversation without a title, the frontend automatically strips system prefixes:
- Markdown headers (`# ...`)
- Attachment blocks (`[Attachment: ...]`)
- Executive context blocks (`# Document Executive Context:`)

It generates a clean, readable display header ($\le 36$ characters) for the sidebar before manual renaming.

---

## 🧠 Chat History Sliding Window & Anchoring

When a thread exceeds 10 turns:
- The **last 8 turns** are retained verbatim in LLM prompt context.
- Turns prior to the active 8 are summarized into a concise 2-line memory block:
  ```
  [System Memory: Conversation Summary Anchor]
  User previously analyzed Q2 DORA metrics and reviewed Sarah's promotion dossier.
  ```
- This guarantees constant prompt token usage and avoids LLM context window bloat.
