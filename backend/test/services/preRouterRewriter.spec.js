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
    expect(result.entities.prNumber).toBe('104');
    expect(result.entities.author).toBe('Alice');
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
    expect(result.entities.author).toBe('eng_01');
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
    expect(result.entities.sprintId).toBe('Sprint 24');
    expect(result.entities.teamId).toBe('Platform Core');
    expect(result.rewrittenQuery).toContain('Sprint 24');
    expect(result.rewrittenQuery).toContain("team 'Platform Core'");
  });
});
