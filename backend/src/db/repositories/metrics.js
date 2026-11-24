/**
 * DORA snapshots, SBI records, sprint analytics and OKRs.
 * Methods are mixed into DatabaseService (src/db/postgres.js); `this` is the service.
 */
import { warn } from '../../utils/logger.js';
import { swallow } from '../../core/safe.js';
import { measuredOrNull } from '../rowMappers.js';

export const SEEDED_PLACEHOLDER_KEY_RESULTS = [
  'KR1: Maintain >99.9% API uptime across core gateway services',
  'KR2: Reduce P95 API response latency to <150ms under peak load',
  'KR3: Achieve >=85% unit and integration test coverage across all microservices',
  'KR4: Decrease PR code review turnaround time to <12 hours',
  'KR5: Complete 100% of bi-weekly 1-on-1 career progression check-ins',
];

export class MetricsRepository {
  async saveDoraSnapshot(data) {
    await this.ensureInitialized().catch(swallow('db.postgres.saveDoraSnapshot'));
    const record = {
      id: this.inMemoryDoraSnapshots.length + 1,
      team_id: data.team_id || 'default',
      // null = not measured; 0 would read as a real (and excellent) value.
      deployment_frequency: measuredOrNull(data.deployment_frequency),
      lead_time_hours: measuredOrNull(data.lead_time_hours),
      change_failure_rate: measuredOrNull(data.change_failure_rate),
      mttr_hours: measuredOrNull(data.mttr_hours),
      period_start: data.period_start || new Date(),
      period_end: data.period_end || new Date(),
      created_at: new Date(),
    };
    if (!this.pool) {
      this.inMemoryDoraSnapshots.push(record);
      return record;
    }
    try {
      const res = await this.pool.query(
        `INSERT INTO dora_snapshots (team_id, deployment_frequency, lead_time_hours, change_failure_rate, mttr_hours, period_start, period_end)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [record.team_id, record.deployment_frequency, record.lead_time_hours, record.change_failure_rate, record.mttr_hours, record.period_start, record.period_end]
      );
      return res.rows[0];
    } catch (err) {
      warn('PostgreSQL saveDoraSnapshot failed, using in-memory fallback', { err: err.message });
      this.inMemoryDoraSnapshots.push(record);
      return record;
    }
  }

  async getDoraSnapshots(teamId = null) {
    await this.ensureInitialized().catch(swallow('db.postgres.getDoraSnapshots'));
    if (!this.pool) {
      return teamId ? this.inMemoryDoraSnapshots.filter(r => r.team_id === teamId) : this.inMemoryDoraSnapshots;
    }
    try {
      const queryText = teamId ? `SELECT * FROM dora_snapshots WHERE team_id = $1 ORDER BY created_at DESC` : `SELECT * FROM dora_snapshots ORDER BY created_at DESC`;
      const params = teamId ? [teamId] : [];
      const res = await this.pool.query(queryText, params);
      if (res.rows.length === 0 && this.inMemoryDoraSnapshots.length > 0) {
        return teamId ? this.inMemoryDoraSnapshots.filter(r => r.team_id === teamId) : [...this.inMemoryDoraSnapshots];
      }
      return res.rows;
    } catch (err) {
      warn('PostgreSQL getDoraSnapshots failed, using in-memory fallback', { err: err.message });
      return teamId ? this.inMemoryDoraSnapshots.filter(r => r.team_id === teamId) : this.inMemoryDoraSnapshots;
    }
  }

  async saveSbiRecord(data) {
    await this.ensureInitialized().catch(swallow('db.postgres.saveSbiRecord'));
    const record = {
      id: this.inMemorySbiRecords.length + 1,
      engineer_id: data.engineer_id || 'unknown',
      situation: data.situation || '',
      behavior: data.behavior || '',
      impact: data.impact || '',
      action_plan: data.action_plan || '',
      created_at: new Date(),
    };
    if (!this.pool) {
      this.inMemorySbiRecords.push(record);
      return record;
    }
    try {
      const res = await this.pool.query(
        `INSERT INTO sbi_feedback_records (engineer_id, situation, behavior, impact, action_plan)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [record.engineer_id, record.situation, record.behavior, record.impact, record.action_plan]
      );
      return res.rows[0];
    } catch (err) {
      warn('PostgreSQL saveSbiRecord failed, using in-memory fallback', { err: err.message });
      this.inMemorySbiRecords.push(record);
      return record;
    }
  }

  async getSbiRecords(engineerId = null) {
    await this.ensureInitialized().catch(swallow('db.postgres.getSbiRecords'));
    if (!this.pool) {
      return engineerId ? this.inMemorySbiRecords.filter(r => r.engineer_id === engineerId) : this.inMemorySbiRecords;
    }
    try {
      const queryText = engineerId ? `SELECT * FROM sbi_feedback_records WHERE engineer_id = $1 ORDER BY created_at DESC` : `SELECT * FROM sbi_feedback_records ORDER BY created_at DESC`;
      const params = engineerId ? [engineerId] : [];
      const res = await this.pool.query(queryText, params);
      return res.rows;
    } catch (err) {
      warn('PostgreSQL getSbiRecords failed, using in-memory fallback', { err: err.message });
      return engineerId ? this.inMemorySbiRecords.filter(r => r.engineer_id === engineerId) : this.inMemorySbiRecords;
    }
  }

  async saveSprintAnalytics(data) {
    await this.ensureInitialized().catch(swallow('db.postgres.saveSprintAnalytics'));
    const record = {
      id: this.inMemorySprintAnalytics.length + 1,
      sprint_id: data.sprint_id || `sprint_${Date.now()}`,
      total_points: data.total_points || 0,
      completed_points: data.completed_points || 0,
      wip_violations: data.wip_violations || 0,
      retro_action_items: data.retro_action_items || [],
      created_at: new Date(),
    };
    if (!this.pool) {
      this.inMemorySprintAnalytics.push(record);
      return record;
    }
    try {
      const res = await this.pool.query(
        `INSERT INTO sprint_analytics (sprint_id, total_points, completed_points, wip_violations, retro_action_items)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (sprint_id) DO UPDATE SET total_points = EXCLUDED.total_points, completed_points = EXCLUDED.completed_points, wip_violations = EXCLUDED.wip_violations, retro_action_items = EXCLUDED.retro_action_items
         RETURNING *`,
        [record.sprint_id, record.total_points, record.completed_points, record.wip_violations, JSON.stringify(record.retro_action_items)]
      );
      return res.rows[0];
    } catch (err) {
      warn('PostgreSQL saveSprintAnalytics failed, using in-memory fallback', { err: err.message });
      this.inMemorySprintAnalytics.push(record);
      return record;
    }
  }

  async getSprintAnalytics(sprintId = null) {
    await this.ensureInitialized().catch(swallow('db.postgres.getSprintAnalytics'));
    if (!this.pool) {
      return sprintId ? this.inMemorySprintAnalytics.filter(r => r.sprint_id === sprintId) : this.inMemorySprintAnalytics;
    }
    try {
      const queryText = sprintId ? `SELECT * FROM sprint_analytics WHERE sprint_id = $1` : `SELECT * FROM sprint_analytics ORDER BY created_at DESC`;
      const params = sprintId ? [sprintId] : [];
      const res = await this.pool.query(queryText, params);
      if (res.rows.length === 0 && this.inMemorySprintAnalytics.length > 0) {
        return sprintId ? this.inMemorySprintAnalytics.filter(r => r.sprint_id === sprintId) : [...this.inMemorySprintAnalytics];
      }
      return res.rows;
    } catch (err) {
      warn('PostgreSQL getSprintAnalytics failed, using in-memory fallback', { err: err.message });
      return sprintId ? this.inMemorySprintAnalytics.filter(r => r.sprint_id === sprintId) : this.inMemorySprintAnalytics;
    }
  }

  async saveOkrRecord(data) {
    await this.ensureInitialized().catch(swallow('db.postgres.saveOkrRecord'));
    const record = {
      id: this.inMemoryOkrTracker.length + 1,
      objective: data.objective || '',
      key_result: data.key_result || '',
      target_value: data.target_value || 100,
      current_value: data.current_value || 0,
      status: data.status || 'ON_TRACK',
      quarter: data.quarter || 'Q1',
      created_at: new Date(),
    };
    if (!this.pool) {
      this.inMemoryOkrTracker.push(record);
      return record;
    }
    try {
      const res = await this.pool.query(
        `INSERT INTO okr_tracker (objective, key_result, target_value, current_value, status, quarter)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [record.objective, record.key_result, record.target_value, record.current_value, record.status, record.quarter]
      );
      return res.rows[0];
    } catch (err) {
      warn('PostgreSQL saveOkrRecord failed, using in-memory fallback', { err: err.message });
      this.inMemoryOkrTracker.push(record);
      return record;
    }
  }

  async getOkrRecords(quarter = null) {
    await this.ensureInitialized().catch(swallow('db.postgres.getOkrRecords'));
    if (!this.pool) {
      return quarter ? this.inMemoryOkrTracker.filter(r => r.quarter === quarter) : this.inMemoryOkrTracker;
    }
    try {
      const queryText = quarter ? `SELECT * FROM okr_tracker WHERE quarter = $1 ORDER BY created_at DESC` : `SELECT * FROM okr_tracker ORDER BY created_at DESC`;
      const params = quarter ? [quarter] : [];
      const res = await this.pool.query(queryText, params);
      if (res.rows.length === 0 && this.inMemoryOkrTracker.length > 0) {
        return quarter ? this.inMemoryOkrTracker.filter(r => r.quarter === quarter) : [...this.inMemoryOkrTracker];
      }
      return res.rows;
    } catch (err) {
      warn('PostgreSQL getOkrRecords failed, using in-memory fallback', { err: err.message });
      return quarter ? this.inMemoryOkrTracker.filter(r => r.quarter === quarter) : this.inMemoryOkrTracker;
    }
  }

  async getOkrsByQuarter(quarter = null) {
    return this.getOkrRecords(quarter);
  }

  /**
   * Earlier versions of the OKR agent inserted five invented key results into okr_tracker when
   * the table was empty. Remove exactly those rows (matched on their full key_result text) so
   * they can no longer be mistaken for real OKRs.
   */
  async purgeSeededPlaceholderOkrs() {
    if (!this.pool) return 0;
    const res = await this.pool.query(
      'DELETE FROM okr_tracker WHERE key_result = ANY($1::text[])',
      [SEEDED_PLACEHOLDER_KEY_RESULTS],
    );
    if (res.rowCount > 0) {
      warn('Removed placeholder OKR rows that were seeded by an earlier version', { removed: res.rowCount });
    }
    return res.rowCount || 0;
  }
}
