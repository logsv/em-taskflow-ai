import { CAPABILITIES, CAPABILITY_DOMAINS, resolveDomains, listCapabilities } from '../../src/capabilities/registry.js';
import { detectTarget, isListQuery } from '../../src/capabilities/targets.js';
import { runCapabilityPipeline, executeCapabilities } from '../../src/pipeline/capabilityPipeline.js';
import { doraMetricsTool } from '../../src/agent/doraAgent.js';
import { deliveryBottlenecksTool } from '../../src/agent/deliveryAgent.js';
import { getCounter, resetMetrics } from '../../src/core/metrics.js';

const decision = () => ({ toolsUsed: [], provenance: [], reasons: [] });

describe('Capability registry', () => {
  it('groups the 10 domain tools into 5 capabilities, each domain served once', () => {
    expect(CAPABILITIES.length).toBe(5);
    expect(CAPABILITY_DOMAINS.sort()).toEqual(['critic', 'delivery', 'dora', 'okr', 'people', 'retro', 'roadmap', 'sbi', 'sop', 'sprint']);
    expect(listCapabilities().every((c) => c.examples.length > 0 && c.tools.length === 2)).toBeTrue();
  });

  it('ignores integration and RAG domains (they are not capability tools)', () => {
    expect(resolveDomains(['github', 'rag', 'dora', 'dora']).map((r) => r.domain)).toEqual(['dora']);
  });

  it('derives the tool view from the query', () => {
    expect(detectTarget('which pull requests are stuck')).toBe('PRS');
    expect(detectTarget('how are we doing')).toBe('ALL');
    expect(isListQuery('list all blockers')).toBeTrue();
  });
});

describe('Capability pipeline', () => {
  beforeEach(() => resetMetrics());

  it('answers from tool summaries and lists a failed source instead of dropping it', async () => {
    spyOn(doraMetricsTool, 'invoke').and.resolveTo({ status: 'SUCCESS', data: { summary: 'DORA: lead time 12h' }, provenance: [{ source: 'github', mode: 'live' }] });
    spyOn(deliveryBottlenecksTool, 'invoke').and.resolveTo({ status: 'FAILED', error: 'INTEGRATION_UNAUTHORIZED: Jira token rejected' });
    const d = decision();
    const res = await runCapabilityPipeline('how is delivery', { domains: ['dora', 'delivery'] }, d);
    expect(res.answer).toContain('DORA: lead time 12h');
    expect(res.answer).toContain('Not included');
    expect(res.answer).toContain('Jira token rejected');
    expect(d.selectedPath).toBe('capability-pipeline');
    expect(d.verification.complete).toBeFalse();
    expect(d.provenance[0]).toEqual(jasmine.objectContaining({ source: 'github', domain: 'dora' }));
    expect(getCounter('capability_pipeline_total', { outcome: 'partial' })).toBe(1);
  });

  it('abstains, naming what failed, when no tool produced data', async () => {
    spyOn(doraMetricsTool, 'invoke').and.rejectWith(new Error('connect ECONNREFUSED 127.0.0.1:5432'));
    const d = decision();
    const res = await runCapabilityPipeline('dora metrics', { domains: ['dora'] }, d);
    expect(d.selectedPath).toBe('capability-pipeline-abstained');
    expect(res.answer).toContain('I could not get data for this request');
    expect(res.answer).toContain('DEPENDENCY_UNAVAILABLE');
    expect(res.answer).toContain('Nothing above was estimated');
  });

  it('times out a hung tool and reports it', async () => {
    spyOn(doraMetricsTool, 'invoke').and.returnValue(new Promise(() => {}));
    const runs = await executeCapabilities('dora', ['dora'], { toolTimeoutMs: 20 });
    expect(runs[0].status).toBe('FAILED');
    expect(runs[0].error).toContain('TOOL_TIMEOUT');
  });

  it('returns null for plans without capability domains', async () => {
    expect(await runCapabilityPipeline('my calendar', { domains: ['calendar'] }, decision())).toBeNull();
  });

  it('passes list mode and the detected target to the tool', async () => {
    const spy = spyOn(deliveryBottlenecksTool, 'invoke').and.resolveTo({ status: 'SUCCESS', data: { summary: 'ok' } });
    await executeCapabilities('list all blocked tickets', ['delivery']);
    expect(spy.calls.mostRecent().args[0]).toEqual(jasmine.objectContaining({ mode: 'LIST_RAW', target: 'BLOCKERS', sources: ['github', 'jira'] }));
  });
});

describe('Document search failure', () => {
  it('says search is unavailable instead of "no matching documents"', async () => {
    const { default: service } = await import('../../src/services/agentService.js');
    const ragService = (await import('../../src/rag/index.js')).default;
    spyOn(ragService, 'baselineRetrieve').and.rejectWith(new Error('connect ECONNREFUSED 127.0.0.1:8000'));
    service.ragEnabled = true;
    const d = { reasons: [], ragMode: 'baseline' };
    const res = await service.runEnforcedPolicy('summarise the onboarding document', { domains: ['rag'], allow_rag: true, must_use_tools: false, confidence: 0.9 }, d, {});
    expect(d.selectedPath).toBe('rag-unavailable');
    expect(res.answer).toContain('Document search is unavailable');
    expect(res.answer).not.toContain('No matching document chunks');
  });
});
