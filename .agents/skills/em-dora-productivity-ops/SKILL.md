---
name: em-dora-productivity-ops
description: Procedures for tracking, testing, and managing Engineering Manager (EM) DORA productivity metrics, Sprint health analytics, OKRs, and SBI feedback records in EM TaskFlow AI.
---

# EM DORA & Productivity Metrics Skill

Use this skill when developing, testing, or auditing Engineering Manager (EM) productivity features, DORA metrics APIs, Sprint health calculations, or Situation-Behavior-Impact (SBI) feedback logs.

## 📌 Architecture Overview

1. **DORA Productivity Metrics**:
   - Endpoint: `GET /api/em/dora`
   - Tracks 4 core DORA metrics: Deployment Frequency, Lead Time to Changes, Change Failure Rate, and Mean Time to Recovery (MTTR).
   - Data stored in PostgreSQL table `dora_snapshots`.

2. **Sprint Health & WIP Analytics**:
   - Endpoint: `GET /api/em/sprints`
   - Monitors active sprint velocity, committed vs completed story points, WIP limit violations, and retrospective action items (`sprint_analytics` table).

3. **OKR Progress Tracking**:
   - Endpoint: `GET /api/em/okrs`
   - Tracks quarterly Objectives and Key Results completion status (`okr_tracker` table).

4. **Situation-Behavior-Impact (SBI) Feedback**:
   - Endpoint: `GET /api/em/sbi`
   - Structure for capture and review of structured engineer feedback (`sbi_feedback_records` table).

## 🧪 Verification Commands

### Test DORA Metrics Endpoint
```bash
curl -s http://localhost:4000/api/em/dora
```

### Test Sprint Health Endpoint
```bash
curl -s http://localhost:4000/api/em/sprints
```

### Query DORA Snapshots via Database CLI
```bash
node -e "import('./src/db/postgres.js').then(async (m) => { const db = m.default; console.log('Stats:', await db.getStats()); });"
```

### Run Full Test Suite
```bash
npm test
```
