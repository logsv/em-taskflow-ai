import { sopComplianceTool, createSopAgent } from '../../src/agent/sopAgent.js';
import { auditReportTool, createCriticAgent } from '../../src/agent/criticAgent.js';

describe('Phase 6 Knowledge & Quality Agents Specs: SOP RAG & Reflective Critic Harnesses', () => {
  describe('sopAgent & query_sop_compliance Tool Harness', () => {
    it('should audit SOP compliance in ANALYZE mode', async () => {
      const res = await sopComplianceTool.invoke({
        topic: 'code_review',
        task_context: 'PR #402 requiring 2 approvals',
      });

      expect(res.status).toBe('SUCCESS');
      expect(res.name).toBe('query_sop_compliance');
      expect(res.data.compliance_status).toBe('COMPLIANT');
      expect(Array.isArray(res.data.checked_sops)).toBe(true);
    });

    it('should list checked SOPs in LIST_RAW mode', async () => {
      const res = await sopComplianceTool.invoke({
        topic: 'security',
        mode: 'LIST_RAW',
      });

      expect(res.status).toBe('SUCCESS');
      expect(res.data.mode).toBe('LIST_RAW');
      expect(Array.isArray(res.data.items)).toBe(true);
    });

    it('should create sopAgent safely', () => {
      const agent = createSopAgent();
      expect(agent).toBeDefined();
    });
  });

  describe('criticAgent & audit_em_report Tool Harness', () => {
    it('should audit draft EM response for tone, math, and link integrity', async () => {
      const res = await auditReportTool.invoke({
        draft_response: '## Summary\nLead time is 18.5 hours. See details in [DORA Report](file:///path/to/report.md)',
        audit_type: 'full_audit',
      });

      expect(res.status).toBe('SUCCESS');
      expect(res.name).toBe('audit_em_report');
      expect(res.data.approved).toBe(true);
      expect(res.data.audits.tone_empathy_check).toContain('PASS');
      expect(res.data.audits.math_accuracy_check).toContain('PASS');
      expect(res.data.audits.link_integrity_check).toContain('PASS');
    });

    it('should create criticAgent safely', () => {
      const agent = createCriticAgent();
      expect(agent).toBeDefined();
    });
  });
});
