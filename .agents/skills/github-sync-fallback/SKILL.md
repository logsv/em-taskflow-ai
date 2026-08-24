---
name: github-sync-fallback
description: Procedures for testing live GitHub REST API sync, repo-scoped PAT authentication, and PostgreSQL issue caching in EM TaskFlow AI.
---

# GitHub Sync & Database Fallback Skill

Use this skill when testing or debugging GitHub API data synchronization, repo-scoped PAT authentication, PostgreSQL issue caching, or fallback stores.

---

## 📌 Architecture Overview

1. **GitHub Live Sync**:
   - Endpoint: `POST /api/github/sync`
   - Fetches open pull requests and issues using Native GitHub REST API with User-Agent header and `repo` scoped `GITHUB_TOKEN`.
   - Persists issues to PostgreSQL `github_issues` table (with `inMemoryGithubIssues` fallback if DB is offline).

2. **Cached Issue Search**:
   - `searchGithubIssuesInDb(query)` performs case-insensitive `ILIKE` or `pg_trgm` search on `title`, `body`, and `repo`.

3. **Frontend Sync Controls**:
   - Accessible via the Refresh button in the UI and Admin Portal.

---

## 🧪 Verification Commands

### Test GitHub Sync via API
```bash
curl -X POST http://localhost:4000/api/github/sync -H "Content-Type: application/json"
```

### Test Database Issue Search
```bash
node -e "import('./src/db/postgres.js').then(async (m) => { const db = m.default; console.log('Issues:', await db.listGithubIssues()); });"
```

### Run Full Test Suite (233 Specs)
```bash
cd backend
npm test
```
