import preRouterRewriter from '../../src/services/preRouterRewriter.js';

describe('PreRouterRewriter (Tier 1 Coreference & Follow-Up Context Resolution)', () => {
  it('should return raw query untouched if no coreferences exist', () => {
    const query = 'Calculate DORA metrics for logsv/em-taskflow-ai';
    const result = preRouterRewriter.resolveQuery(query, []);
    expect(result.wasRewritten).toBe(false);
    expect(result.rewrittenQuery).toBe(query);
  });

  it('should resolve PR and author coreferences from recent history', () => {
    const history = [
      { role: 'user', content: 'Show me the latest pull requests in logsv/em-taskflow-ai' },
      {
        role: 'assistant',
        content: 'Found PR #104: auth-service refactor. Author: Alice (eng_01). Review has been pending for 4 days.',
      },
    ];

    const followUpQuery = 'Draft an SBI coaching feedback for the author of that PR regarding the review delay';
    const result = preRouterRewriter.resolveQuery(followUpQuery, history);

    expect(result.wasRewritten).toBe(true);
    expect(result.entities.pr).toBe('#104');
    expect(result.entities.engineer).toBe('Alice');
    expect(result.rewrittenQuery).toContain('Alice (author of PR #104)');
    expect(result.rewrittenQuery).toContain('PR #104 in logsv/em-taskflow-ai');
  });

  it('should resolve "his OKRs" pronoun to author name from previous turn', () => {
    const history = [
      {
        role: 'assistant',
        content: 'Reviewing performance for engineer eng_01 (Alice). Deployment frequency is 3.5/week.',
      },
    ];

    const followUp = 'What about his OKRs for this quarter?';
    const result = preRouterRewriter.resolveQuery(followUp, history);

    expect(result.wasRewritten).toBe(true);
    expect(result.entities.engineer).toBe('eng_01');
    expect(result.rewrittenQuery).toContain("eng_01's OKRs");
  });

  it('should resolve sprint and team references from history', () => {
    const history = [
      {
        role: 'assistant',
        content: 'Sprint 24 velocity is on track for team Platform Core.',
      },
    ];

    const followUp = 'Generate retro action items for the same sprint and that team';
    const result = preRouterRewriter.resolveQuery(followUp, history);

    expect(result.wasRewritten).toBe(true);
    expect(result.entities.sprint).toBe('Sprint 24');
    expect(result.entities.team).toBe('Platform Core');
    expect(result.rewrittenQuery).toContain('Sprint 24');
    expect(result.rewrittenQuery).toContain("team 'Platform Core'");
  });

  it('resolves "him" to the engineer named in history, preferring the PR owner over a reviewer', () => {
    const history = [
      { role: 'user', content: 'Who reviewed PR #142 for alex-dev?' },
      { role: 'assistant', content: 'PR #142 was reviewed by senior engineer Sarah.' },
    ];
    const result = preRouterRewriter.resolveQuery('Draft an SBI feedback for him regarding that pull request.', history);
    expect(result.entities.engineer).toBe('alex-dev');
    expect(result.entities.pr).toBe('#142');
    expect(result.rewrittenQuery).toBe('Draft an SBI feedback for alex-dev regarding PR #142.');
  });

  it('expands a bare first name to the full name from history', () => {
    const history = [
      { role: 'user', content: 'Evaluate Sarah Chen competency radar.' },
      { role: 'assistant', content: 'Sarah Chen scored 4.2/5.0 across 12 dimensions.' },
    ];
    const result = preRouterRewriter.resolveQuery('Calculate career progression milestones for Sarah.', history);
    expect(result.entities.engineer).toBe('Sarah Chen');
    expect(result.rewrittenQuery).toBe('Calculate career progression milestones for Sarah Chen.');
  });

  it('resolves "that same service" to a service name and ignores units and product names', () => {
    const history = [
      { role: 'user', content: 'What is deployment frequency for payments-backend?' },
      { role: 'assistant', content: 'payments-backend deploys 4.2 times per week. 2 PTOs are in Google Calendar at 4 deploys/week.' },
    ];
    const result = preRouterRewriter.resolveQuery('What is the change failure rate for that same service?', history);
    expect(result.entities.repository).toBe('payments-backend');
    expect(result.entities.engineer).toBeUndefined();
    expect(result.entities.metric).toBe('DORA');
    expect(result.rewrittenQuery).toBe('What is the change failure rate for payments-backend?');
  });

  it('does not take a role word for a first name', () => {
    const history = [{ role: 'assistant', content: 'Engineer Dave has an average review queue turnaround of 28 hours.' }];
    const result = preRouterRewriter.resolveQuery('Draft constructive coaching for him on code review turnaround.', history);
    expect(result.entities.engineer).toBe('Dave');
  });

  it('leaves a query with no reference untouched even when history has entities', () => {
    const history = [{ role: 'assistant', content: 'Sprint 42 has 3 blockers for Alex Kumar.' }];
    const result = preRouterRewriter.resolveQuery('List open incidents.', history);
    expect(result.wasRewritten).toBe(false);
    expect(result.entities).toEqual({});
  });
});
