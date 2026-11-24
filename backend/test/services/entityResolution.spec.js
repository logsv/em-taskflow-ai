import identityService from '../../src/services/identityService.js';
import agentService from '../../src/services/agentService.js';
import { peopleGrowthTool } from '../../src/agent/peopleAgent.js';

const ROSTER = [
  { id: 'mem_jon', displayName: 'Jonathan Park', githubUsername: 'jpark', aliases: [] },
  { id: 'mem_alex_c', displayName: 'Alex Chen', githubUsername: 'achen', aliases: [] },
  { id: 'mem_alex_r', displayName: 'Alex Rivera', githubUsername: 'arivera', aliases: [] },
];

describe('Engineer entity resolution', () => {
  beforeEach(() => spyOn(identityService, 'getAllMembers').and.resolveTo(ROSTER));

  it('does not match substrings ("on" is not Jonathan)', async () => {
    expect(await identityService.findMemberCandidates('is growth on track this quarter?')).toEqual([]);
  });

  it('matches a full name, a handle, or a unique first name', async () => {
    expect((await identityService.findMemberCandidates('How is Alex Chen doing?')).map((m) => m.id)).toEqual(['mem_alex_c']);
    expect((await identityService.findMemberCandidates('PRs by @jpark.')).map((m) => m.id)).toEqual(['mem_jon']);
    expect((await identityService.resolveMemberFromText('career plan for jonathan'))?.id).toBe('mem_jon');
  });

  it('returns every candidate for an ambiguous first name, and resolveMemberFromText refuses to guess', async () => {
    expect((await identityService.findMemberCandidates('1-on-1 notes for alex')).length).toBe(2);
    expect(await identityService.resolveMemberFromText('1-on-1 notes for alex')).toBeNull();
  });

  it('asks which engineer is meant instead of running the people tool', async () => {
    const tool = spyOn(peopleGrowthTool, 'invoke');
    const decision = { reasons: [], toolsUsed: [], provenance: [] };
    const res = await agentService.runRequiredDomainRecovery('how is alex progressing to senior', { domains: ['people'] }, decision, {});
    expect(decision.selectedPath).toBe('clarification');
    expect(res.answer).toContain('Alex Chen');
    expect(res.answer).toContain('Alex Rivera');
    expect(tool).not.toHaveBeenCalled();
  });
});
