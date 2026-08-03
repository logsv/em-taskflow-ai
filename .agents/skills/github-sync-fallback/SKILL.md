---
name: github-sync-fallback
description: Procedures for testing live GitHub REST API sync, PostgreSQL issue caching, and manual UI refresh in EM TaskFlow AI.
---

# GitHub Sync & Database Fallback Skill

Use this skill when testing or debugging GitHub API data synchronization, PostgreSQL issue caching, or fallback stores.

## 📌 Architecture Overview

1. **GitHub Live Sync**:
   - Endpoint: `POST /api/github/sync`
   - Fetches open pull requests and issues using Native GitHub REST API (`octokit` / fetch with `GITHUB_TOKEN`).
   - Persists issues to PostgreSQL `github_issues` table (with `inMemoryGithubIssues` fallback if DB is offline).

2. **Cached Issue Search**:
   - `searchGithubIssuesInDb(query)` performs case-insensitive `ILIKE` or `pg_trgm` search on `title`, `body`, and `repo`.

3. **Frontend Sync Button**:
   - Triggered by the `Refresh GitHub Data` header button in `App.jsx` and `Sidebar.jsx`.

## 🧪 Verification Commands

### Test GitHub Sync via API
```bash
curl -X POST http://localhost:4000/api/github/sync -H "Content-Type: application/json"
```

### Test Database Issue Search
```bash
node -e "import('./src/db/postgres.js').then(async (m) => { const db = m.default; console.log('Issues:', await db.listGithubIssues()); });"
```
