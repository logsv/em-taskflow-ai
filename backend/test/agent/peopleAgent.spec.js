import { peopleGrowthTool, createPeopleAgent, COMPETENCY_DIMENSIONS, LEVEL_BENCHMARKS } from '../../src/agent/peopleAgent.js';

describe('peopleAgent & analyze_personnel_growth Tool Harness', () => {
  it('should define 12 standardized competency dimensions', () => {
    expect(COMPETENCY_DIMENSIONS.length).toBe(12);
    const keys = COMPETENCY_DIMENSIONS.map((d) => d.key);
    expect(keys).toContain('ARCH');
    expect(keys).toContain('DB');
    expect(keys).toContain('CLOUD');
    expect(keys).toContain('SEC');
    expect(keys).toContain('CODE');
    expect(keys).toContain('DELIV');
    expect(keys).toContain('MENTOR');
    expect(keys).toContain('COLLAB');
    expect(keys).toContain('STRAT');
    expect(keys).toContain('INCID');
    expect(keys).toContain('ALIGN');
    expect(keys).toContain('CULT');
  });

  it('should evaluate engineer competencies across 12 dimensions against target level requirements', async () => {
    const res = await peopleGrowthTool.invoke({
      engineer_id: 'eng_alex',
      current_level: 'L4_MID',
      target_level: 'L5_SENIOR',
      track: 'INDIVIDUAL_CONTRIBUTOR',
      tenure_months: 18,
    });

    expect(res.status).toBe('SUCCESS');
    expect(res.name).toBe('analyze_personnel_growth');
    expect(res.data.mode).toBe('ANALYZE');
    expect(res.data.competency_radar.length).toBe(12);
    expect(res.data.metrics.promotion_readiness_score).toBeGreaterThanOrEqual(70);
    expect(res.data.metrics.promotion_verdict).toBeDefined();
    expect(res.data.roadmaps.immediate_3_to_6m).toBeDefined();
    expect(res.data.roadmaps.medium_6_to_18m).toBeDefined();
    expect(res.data.roadmaps.long_term_1_to_3y).toBeDefined();
    expect(res.data.summary).toContain('Competency Radar & Gap Analysis');
  });

  it('should evaluate Management Track (M1/M2) with leadership and hiring prerequisites', async () => {
    const res = await peopleGrowthTool.invoke({
      engineer_id: 'eng_sarah',
      current_level: 'L5_SENIOR',
      target_level: 'M1_EM',
      track: 'ENGINEERING_MANAGEMENT',
      tenure_months: 24,
    });

    expect(res.status).toBe('SUCCESS');
    expect(res.data.track).toBe('ENGINEERING_MANAGEMENT');
    expect(res.data.roadmaps.long_term_1_to_3y.focus).toContain('Engineering Management');
  });

  it('should detect high burnout risk when workload or meeting hours exceed thresholds', async () => {
    const res = await peopleGrowthTool.invoke({
      engineer_id: 'eng_overloaded',
      current_level: 'L4_MID',
      target_level: 'L5_SENIOR',
    });

    expect(res.status).toBe('SUCCESS');
    expect(res.data.metrics.burnout_risk_score).toBeDefined();
    expect(['LOW', 'MEDIUM', 'HIGH']).toContain(res.data.metrics.burnout_risk_score);
  });

  it('should support LIST_RAW mode to return calendar 1-on-1 events', async () => {
    const res = await peopleGrowthTool.invoke({
      engineer_id: 'eng_alex',
      mode: 'LIST_RAW',
      filter: 'ONE_ON_ONES',
    });

    expect(res.status).toBe('SUCCESS');
    expect(res.data.mode).toBe('LIST_RAW');
    expect(Array.isArray(res.data.items)).toBe(true);
    expect(res.data.totalEvents).toBeGreaterThanOrEqual(1);
  });

  it('should instantiate createPeopleAgent graph', () => {
    const agent = createPeopleAgent();
    expect(agent).toBeDefined();
  });
});
