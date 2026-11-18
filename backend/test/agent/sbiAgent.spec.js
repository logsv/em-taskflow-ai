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
    expect(res.data.structured_feedback.action_plan).toBeNull(); // not supplied, not invented
    expect(res.data.status).toBe('OK');
    expect(res.data.structured_feedback.behavior).toBe('Alex merged PR #402 without peer review signoff');
    expect(res.data.structured_feedback.impact).toBe('caused a 35-minute auth outage');
    expect(res.data.persisted).toBe(true);
    expect(databaseService.inMemorySbiRecords.length).toBe(1);
    expect(res.data.summary).toContain('Situation-Behavior-Impact (SBI) Feedback');
    expect(res.data.summary).toContain('To be agreed with eng_alex in the 1-on-1');
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
    // The draft states no impact, so nothing is invented or saved.
    expect(res.data.status).toBe('NEEDS_INPUT');
    expect(res.data.missing_fields).toEqual(['impact']);
    expect(res.data.structured_feedback.impact).toBeNull();
    expect(res.data.talking_script).toBeNull();
    expect(databaseService.inMemorySbiRecords.length).toBe(0);
  });

  it('should generate empathetic 1-on-1 manager talking scripts for constructive feedback', async () => {
    const res = await sbiFeedbackTool.invoke({
      engineer_id: 'eng_sarah',
      raw_draft: 'Sarah missed the database migration deadline',
      impact: 'delayed the release sign-off by two days',
      feedback_type: 'CONSTRUCTIVE_COACHING',
    });

    expect(res.status).toBe('SUCCESS');
    expect(res.data.talking_script).toBeDefined();
    expect(res.data.talking_script).toContain('eng_sarah');
    expect(res.data.talking_script).toContain('How can I support you');
    expect(res.data.talking_script).toContain('delayed the release sign-off by two days');
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
      impact: 'Unblocked the Q4 platform migration',
      feedback_type: 'POSITIVE_PRAISE',
    });

    // Retrieve via LIST_RAW
    const listRes = await sbiFeedbackTool.invoke({
      engineer_id: 'eng_alex',
      mode: 'LIST_RAW',
    });

    expect(listRes.status).toBe('SUCCESS');
    expect(listRes.data.mode).toBe('LIST_RAW');
    expect(listRes.data.totalRecords).toBe(1);
    expect(listRes.data.items[0].impact).toBe('Unblocked the Q4 platform migration');
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
    expect(res.data.summary).toContain('[PR #402]');
    expect(res.data.summary).toContain('/pull/402');
    expect(res.data.summary).toContain('[ENG-104]');
    expect(res.data.summary).toContain('/browse/ENG-104');
    // The draft gives no impact: input is requested instead of an invented outcome.
    expect(res.data.status).toBe('NEEDS_INPUT');
    expect(res.data.missing_fields).toEqual(['impact']);
  });

  describe('honest empty state when the manager provides no behavior/impact', () => {
    const INVENTED = /35-minute|1,200 active users|PR #402|Blocked 3 downstream|25%|25 minutes|emergency pairing protocol|tech talk/;

    it('returns NO_DATA, invents nothing, and saves nothing when no input is given', async () => {
      const saveSpy = spyOn(databaseService, 'saveSbiRecord').and.callThrough();
      const res = await sbiFeedbackTool.invoke({ engineer_id: 'eng_alex', sources: ['default'] });

      expect(res.status).toBe('SUCCESS');
      expect(res.data.status).toBe('NO_DATA');
      expect(res.data.missing_fields).toEqual(['situation', 'behavior', 'impact']);
      expect(res.data.structured_feedback).toEqual({ situation: null, behavior: null, impact: null, action_plan: null });
      expect(res.data.talking_script).toBeNull();
      expect(res.data.persisted).toBe(false);
      expect(saveSpy).not.toHaveBeenCalled();
      expect(res.data.summary).toContain('Input Needed');
      expect(res.data.summary).not.toMatch(INVENTED);
    });

    it('returns NEEDS_INPUT for each feedback type when impact is missing', async () => {
      for (const feedbackType of ['CONSTRUCTIVE_COACHING', 'POSITIVE_PRAISE']) {
        for (const mode of ['ANALYZE', 'DRILL_DOWN']) {
          const res = await sbiFeedbackTool.invoke({
            engineer_id: 'eng_alex',
            sources: ['default'],
            situation: 'During the code review turnaround cycle',
            behavior: 'Reviewed open pull requests after the 24-hour SLA',
            feedback_type: feedbackType,
            mode,
          });
          expect(res.data.mode).toBe(mode);
          expect(res.data.status).toBe('NEEDS_INPUT');
          expect(res.data.missing_fields).toEqual(['impact']);
          expect(res.data.structured_feedback.impact).toBeNull();
          expect(res.data.structured_feedback.action_plan).toBeNull();
          expect(res.data.summary).not.toMatch(INVENTED);
        }
      }
      expect(databaseService.inMemorySbiRecords.length).toBe(0);
    });

    it('does not default the recipient to a fixture engineer', async () => {
      const res = await sbiFeedbackTool.invoke({ sources: ['default'], mode: 'LIST_RAW' });
      expect(res.data.engineer_id).toBeNull();
      expect(res.data.summary).toContain('All Engineers');
    });
  });

  it('should fall back to PostgreSQL database profile when external MCP APIs time out', async () => {
    const fallback = await sbiFeedbackTool.dbCacheFallback('postgres_sbi', { engineer_id: 'eng_alex' });
    // No stored record: explicit empty state instead of a rubric placeholder.
    expect(fallback.status).toBe('NO_DATA');
    expect(fallback.situation).toBeNull();
    expect(fallback.behavior).toBeNull();
    expect(fallback.impact).toBeNull();
    expect(fallback.is_cached).toBe(true);
    expect(fallback.data_source).toBe('postgres_sbi_records');

    await databaseService.saveSbiRecord({ engineer_id: 'eng_alex', situation: 'During Sprint 7', behavior: 'Paired on the migration', impact: 'Shipped a day early' });
    const stored = await sbiFeedbackTool.dbCacheFallback('postgres_sbi', { engineer_id: 'eng_alex' });
    expect(stored.status).toBe('OK');
    expect(stored.behavior).toBe('Paired on the migration');
  });

  it('should create sbiAgent with custom or default tools', () => {
    const agent = createSbiAgent();
    expect(agent).toBeDefined();
  });
});
