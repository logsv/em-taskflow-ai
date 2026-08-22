import { sbiFeedbackTool, createSbiAgent } from '../../src/agent/sbiAgent.js';
import databaseService from '../../src/db/postgres.js';

describe('sbiAgent & format_sbi_feedback Tool Harness', () => {
  beforeEach(async () => {
    databaseService.inMemorySbiRecords = [];
  });

  it('should format unstructured manager notes into Situation, Behavior, Impact, and Growth Action', async () => {
    const res = await sbiFeedbackTool.invoke({
      engineer_id: 'eng_alex',
      raw_draft: 'Alex merged PR #402 without peer review signoff and it caused a 35-minute auth outage',
      context_type: '1on1_meeting',
      recipient_role: 'Senior Backend Engineer',
    });

    expect(res.status).toBe('SUCCESS');
    expect(res.name).toBe('format_sbi_feedback');
    expect(res.data.mode).toBe('ANALYZE');
    expect(res.data.structured_feedback).toBeDefined();
    expect(res.data.structured_feedback.situation).toBeDefined();
    expect(res.data.structured_feedback.behavior).toBeDefined();
    expect(res.data.structured_feedback.impact).toBeDefined();
    expect(res.data.structured_feedback.action_plan).toBeDefined();
    expect(res.data.summary).toContain('Situation-Behavior-Impact (SBI) Feedback');
  });

  it('should eliminate subjective adjectives (lazy, careless, abrasive) and anchor to observable facts', async () => {
    const res = await sbiFeedbackTool.invoke({
      engineer_id: 'eng_john',
      raw_draft: 'John was lazy and careless in standup and acted abrasive when questioned',
      feedback_type: 'CONSTRUCTIVE_COACHING',
    });

    expect(res.status).toBe('SUCCESS');
    expect(res.data.objectivity_audit.tone_objectivity_score).toBeGreaterThanOrEqual(90);
    expect(res.data.objectivity_audit.bias_risk).toBe('CLEAN');
    // Ensure toxic adjectives are scrubbed
    expect(res.data.structured_feedback.behavior).not.toContain('lazy');
    expect(res.data.structured_feedback.behavior).not.toContain('careless');
    expect(res.data.structured_feedback.behavior).not.toContain('abrasive');
    expect(res.data.objectivity_audit.eliminated_terms.length).toBeGreaterThan(0);
  });

  it('should generate empathetic 1-on-1 manager talking scripts for constructive feedback', async () => {
    const res = await sbiFeedbackTool.invoke({
      engineer_id: 'eng_sarah',
      raw_draft: 'Sarah missed the database migration deadline',
      feedback_type: 'CONSTRUCTIVE_COACHING',
    });

    expect(res.status).toBe('SUCCESS');
    expect(res.data.talking_script).toBeDefined();
    expect(res.data.talking_script).toContain('eng_sarah');
    expect(res.data.talking_script).toContain('How can I support you');
  });

  it('should format positive praise feedback with tech talk or leadership growth step', async () => {
    const res = await sbiFeedbackTool.invoke({
      engineer_id: 'eng_vikas',
      situation: 'During the high-traffic flash sale architecture rollout',
      behavior: 'Engineered an asynchronous Redis semantic caching pipeline',
      impact: 'Reduced P99 API latency by 60% with zero downtime',
      feedback_type: 'POSITIVE_PRAISE',
    });

    expect(res.status).toBe('SUCCESS');
    expect(res.data.feedback_type).toBe('POSITIVE_PRAISE');
    expect(res.data.talking_script).toContain('Thank you');
    expect(res.data.structured_feedback.impact).toContain('Reduced P99 API latency');
  });

  it('should retrieve historical feedback records in LIST_RAW mode', async () => {
    // First, save a record
    await sbiFeedbackTool.invoke({
      engineer_id: 'eng_alex',
      raw_draft: 'Excellent delivery on Q3 microservices refactor',
      feedback_type: 'POSITIVE_PRAISE',
    });

    // Retrieve via LIST_RAW
    const listRes = await sbiFeedbackTool.invoke({
      engineer_id: 'eng_alex',
      mode: 'LIST_RAW',
    });

    expect(listRes.status).toBe('SUCCESS');
    expect(listRes.data.mode).toBe('LIST_RAW');
    expect(listRes.data.totalRecords).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(listRes.data.items)).toBe(true);
  });

  it('should execute multi-source executors including GitHub, Jira, and Notion context', async () => {
    const res = await sbiFeedbackTool.invoke({
      sources: ['default', 'github', 'jira', 'notion'],
      engineer_id: 'Alex Williams',
      raw_draft: 'Alex turned around PR reviews quickly on PR #402 and resolved incident ENG-104',
      feedback_type: 'POSITIVE_PRAISE',
    });

    expect(res.status).toBe('SUCCESS');
    expect(res.data.summary).toContain('[PR #402](https://github.com/logsv/em-taskflow-ai/pull/402)');
    expect(res.data.summary).toContain('[ENG-104](https://jira.atlassian.net/browse/ENG-104)');
  });

  it('should fall back to PostgreSQL database profile when external MCP APIs time out', async () => {
    const fallback = await sbiFeedbackTool.dbCacheFallback('postgres_sbi', { engineer_id: 'eng_alex' });
    expect(fallback.situation).toBeDefined();
    expect(fallback.is_cached).toBe(true);
    expect(fallback.data_source).toContain('postgres');
  });

  it('should create sbiAgent with custom or default tools', () => {
    const agent = createSbiAgent();
    expect(agent).toBeDefined();
  });
});
