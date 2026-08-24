# PostgreSQL Backup & Disaster Recovery

EM TaskFlow AI isolates application state and vector embeddings across separate PostgreSQL databases. Regular backup procedures ensure rapid disaster recovery.

---

## 💾 Backup Procedures

### 1. Backup Application Database (`taskflow_backend`)
```bash
docker exec em-taskflow-postgres pg_dump -U taskflow -d taskflow_backend -F c -b -v -f /tmp/taskflow_backend.dump
docker cp em-taskflow-postgres:/tmp/taskflow_backend.dump ./backups/
```

### 2. Backup Vector Store Database (`taskflow_ai`)
```bash
docker exec em-taskflow-postgres pg_dump -U taskflow -d taskflow_ai -F c -b -v -f /tmp/taskflow_ai.dump
docker cp em-taskflow-postgres:/tmp/taskflow_ai.dump ./backups/
```

### 3. Backup Analytics Database (`langfuse_db`)
```bash
docker exec em-taskflow-analytics-db pg_dump -U langfuse -d langfuse_db -F c -b -v -f /tmp/langfuse_db.dump
docker cp em-taskflow-analytics-db:/tmp/langfuse_db.dump ./backups/
```

---

## 🔄 Restore Procedures

### Restore Application Database
```bash
docker cp ./backups/taskflow_backend.dump em-taskflow-postgres:/tmp/
docker exec em-taskflow-postgres pg_restore -U taskflow -d taskflow_backend --clean --if-exists /tmp/taskflow_backend.dump
```

### Restore Vector Store Database
```bash
docker cp ./backups/taskflow_ai.dump em-taskflow-postgres:/tmp/
docker exec em-taskflow-postgres pg_restore -U taskflow -d taskflow_ai --clean --if-exists /tmp/taskflow_ai.dump
```
