import databaseService from '../../src/db/postgres.js';
import config from '../../src/config.js';

describe('Phase 1 Foundation Specs: DB Tables, Fallbacks & Feature Flags', () => {
  it('should export all 10 agent feature flags in config.js with default value true', () => {
    expect(config.ENABLE_DORA_AGENT).toBe(true);
    expect(config.ENABLE_SBI_AGENT).toBe(true);
    expect(config.ENABLE_PEOPLE_AGENT).toBe(true);
    expect(config.ENABLE_DELIVERY_AGENT).toBe(true);
    expect(config.ENABLE_RETRO_AGENT).toBe(true);
    expect(config.ENABLE_SPRINT_AGENT).toBe(true);
    expect(config.ENABLE_SOP_AGENT).toBe(true);
    expect(config.ENABLE_ROADMAP_AGENT).toBe(true);
    expect(config.ENABLE_OKR_AGENT).toBe(true);
    expect(config.ENABLE_CRITIC_AGENT).toBe(true);
  });

  describe('DORA Snapshots Persistence & Fallbacks', () => {
    it('should save and retrieve DORA snapshots via databaseService', async () => {
      const snapshotData = {
        team_id: 'frontend_team',
        deployment_frequency: 4.5,
        lead_time_hours: 12.0,
        change_failure_rate: 2.1,
        mttr_hours: 1.0,
      };

      const saved = await databaseService.saveDoraSnapshot(snapshotData);
      expect(saved).toBeDefined();
      expect(saved.team_id).toBe('frontend_team');

      const list = await databaseService.getDoraSnapshots('frontend_team');
      expect(Array.isArray(list)).toBe(true);
      expect(list.length).toBeGreaterThan(0);
    });
  });

  describe('SBI Feedback Records Persistence & Fallbacks', () => {
    it('should save and retrieve SBI feedback records', async () => {
      const record = {
        engineer_id: 'eng_alex',
        situation: 'During Sprint 14 retro',
        behavior: 'Proactively volunteered for critical deployment bug',
        impact: 'Saved team 5 hours of downtime',
        action_plan: 'Recognize in team standup',
      };

      const saved = await databaseService.saveSbiRecord(record);
      expect(saved).toBeDefined();
      expect(saved.engineer_id).toBe('eng_alex');

      const list = await databaseService.getSbiRecords('eng_alex');
      expect(Array.isArray(list)).toBe(true);
      expect(list.length).toBeGreaterThan(0);
    });
  });

  describe('Sprint Analytics Persistence & Fallbacks', () => {
    it('should save and retrieve Sprint Analytics data', async () => {
      const sprintData = {
        sprint_id: 'sprint_101',
        total_points: 40,
        completed_points: 36,
        wip_violations: 1,
        retro_action_items: ['Automate PR checks'],
      };

      const saved = await databaseService.saveSprintAnalytics(sprintData);
      expect(saved).toBeDefined();
      expect(saved.sprint_id).toBe('sprint_101');

      const list = await databaseService.getSprintAnalytics('sprint_101');
      expect(Array.isArray(list)).toBe(true);
      expect(list.length).toBeGreaterThan(0);
    });
  });

  describe('OKR Tracker Persistence & Fallbacks', () => {
    it('should save and retrieve OKR Tracker records', async () => {
      const okrData = {
        objective: 'Improve deployment reliability',
        key_result: 'Maintain 99.9% uptime',
        target_value: 99.9,
        current_value: 99.5,
        status: 'ON_TRACK',
        quarter: 'Q3',
      };

      const saved = await databaseService.saveOkrRecord(okrData);
      expect(saved).toBeDefined();
      expect(saved.objective).toBe('Improve deployment reliability');

      const list = await databaseService.getOkrRecords('Q3');
      expect(Array.isArray(list)).toBe(true);
      expect(list.length).toBeGreaterThan(0);
    });
  });
});
