import { classifyFastPath, getDeterministicFallbackPlan } from '../../src/agent/llmRouter.js';

describe('LLM Router Fast-Path Classification', () => {
  it('should route attachment queries directly to LLM document analysis (domains: [], allow_rag: false, must_use_tools: false)', () => {
    const query = '[Attachment: Vikas_Kumar_Resume.pdf]\n# Document Executive Context: Vikas_Kumar_Resume.pdf\nSkills: Python, Node.js, PHP, MySQL\n\nList skills';
    const result = classifyFastPath(query);
    expect(result).not.toBeNull();
    expect(result.domains).toEqual([]);
    expect(result.must_use_tools).toBeFalse();
    expect(result.allow_rag).toBeFalse();
  });

  it('should not intercept attachment queries if explicit external tool like Jira is requested', () => {
    const query = '[Attachment: BugReport.pdf]\nCreate a Jira issue for this bug';
    const result = classifyFastPath(query);
    expect(result).toBeNull(); // Should proceed to LLM Router / Multi-Agent Supervisor
  });

  it('should fast-route conversational follow-ups with history as CONTEXTUAL_SYNTHESIS (0 tools)', () => {
    const query = 'Tell more about Active WIP Count';
    const options = {
      messages: [
        { role: 'user', content: 'Check current sprint delivery bottlenecks' },
        { role: 'assistant', content: '### Delivery Bottleneck Scorecard\nActive WIP Count: 7 items (Limit: 5)' },
      ],
    };
    const result = classifyFastPath(query, options);
    expect(result).not.toBeNull();
    expect(result.intent_type).toBe('CONTEXTUAL_SYNTHESIS');
    expect(result.domains).toEqual([]);
    expect(result.must_use_tools).toBeFalse();
    expect(result.allow_rag).toBeFalse();
  });

  it('should fast-path pure code generation queries with 0 tools', () => {
    const query = 'Write a python function to compute fibonacci numbers.';
    const result = classifyFastPath(query);
    expect(result).not.toBeNull();
    expect(result.domains).toEqual([]);
    expect(result.must_use_tools).toBeFalse();
  });

  it('should fast-path conversational greetings with 0 tools', () => {
    const query = 'Hello there! How are you today?';
    const result = classifyFastPath(query);
    expect(result).not.toBeNull();
    expect(result.domains).toEqual([]);
    expect(result.must_use_tools).toBeFalse();
  });

  it('should return null for domain-specific EM management queries', () => {
    expect(classifyFastPath('Calculate team DORA deployment frequency')).toBeNull();
    expect(classifyFastPath('Check sprint capacity for Sprint 42')).toBeNull();
    expect(classifyFastPath('Review PR cycle times and delivery bottlenecks')).toBeNull();
  });
});

describe('Deterministic Fallback Router (getDeterministicFallbackPlan)', () => {
  it('should route DORA queries accurately', () => {
    const plan = getDeterministicFallbackPlan('Calculate our team DORA deployment frequency and MTTR');
    expect(plan.domains).toContain('dora');
    expect(plan.must_use_tools).toBeTrue();
  });

  it('should route SBI feedback queries with strict precedence over delivery mentions', () => {
    const plan = getDeterministicFallbackPlan('Format an SBI feedback coaching note for Alex regarding code review turnaround');
    expect(plan.domains).toContain('sbi');
    expect(plan.must_use_tools).toBeTrue();
  });

  it('should route career development and competency radar to people agent', () => {
    const plan = getDeterministicFallbackPlan('Review 1-on-1 notes and career ladder competency radar for Sarah');
    expect(plan.domains).toContain('people');
    expect(plan.must_use_tools).toBeTrue();
  });

  it('should route sprint capacity calculations to sprint agent', () => {
    const plan = getDeterministicFallbackPlan('Calculate sprint capacity and story point velocity for Sprint 44');
    expect(plan.domains).toContain('sprint');
    expect(plan.must_use_tools).toBeTrue();
  });

  it('should route document lookups and rubrics to rag', () => {
    const plan = getDeterministicFallbackPlan('Summarize the project plan in the uploaded Project Phoenix PDF document');
    expect(plan.domains).toContain('rag');
    expect(plan.allow_rag).toBeTrue();
    expect(plan.must_use_tools).toBeFalse();
  });
});


