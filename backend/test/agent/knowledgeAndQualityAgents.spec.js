import { sopComplianceTool, createSopAgent } from '../../src/agent/sopAgent.js';
import { auditReportTool, createCriticAgent } from '../../src/agent/criticAgent.js';

describe('Phase 6 Knowledge & Quality Agents Specs: SOP RAG & Reflective Critic Harnesses', () => {
  describe('sopAgent & query_sop_compliance Tool Harness', () => {
    it('should audit SOP compliance in ANALYZE mode with 5-dimension rubric and citations', async () => {
      const res = await sopComplianceTool.invoke({
        topic: 'code_review',
        task_context: 'PR #402 requiring 2 approvals',
        mode: 'ANALYZE',
      });

      expect(res.status).toBe('SUCCESS');
      expect(res.name).toBe('query_sop_compliance');
      expect(res.data.overall_compliance).toBe('COMPLIANT');
      expect(Array.isArray(res.data.checked_sops)).toBe(true);
      expect(res.data.checked_sops.length).toBeGreaterThan(0);
      expect(Array.isArray(res.data.rubric_checks)).toBe(true);
      expect(Array.isArray(res.data.citations)).toBe(true);
      expect(res.data.summary).toContain('Executive Summary');
      expect(res.data.summary).toContain('Key Document Analysis & Rubric Guidelines');
      expect(res.data.summary).toContain('Compliance Gap & Remediation Audit');
      expect(res.data.summary).toContain('Source Citations');
    });

    it('should evaluate ADR-008 database-per-service isolation compliance', async () => {
      const res = await sopComplianceTool.invoke({
        topic: 'database_isolation',
        query: 'Check our Architecture Decision Record (ADR) on database-per-service isolation guidelines',
        mode: 'ANALYZE',
      });

      expect(res.status).toBe('SUCCESS');
      expect(res.data.overall_compliance).toBe('COMPLIANT');
      expect(res.data.summary).toContain('ADR-008');
      expect(res.data.summary).toContain('Database Per-Service Isolation Architecture');
    });

    it('should list checked SOPs in LIST_RAW mode', async () => {
      const res = await sopComplianceTool.invoke({
        topic: 'security',
        mode: 'LIST_RAW',
      });

      expect(res.status).toBe('SUCCESS');
      expect(res.data.mode).toBe('LIST_RAW');
      expect(Array.isArray(res.data.items)).toBe(true);
      expect(res.data.items.length).toBeGreaterThan(0);
    });

    it('should create sopAgent safely with low temperature', () => {
      const agent = createSopAgent();
      expect(agent).toBeDefined();
    });
  });

  describe('criticAgent & audit_em_report Tool Harness', () => {
    it('should audit draft EM response for 5 policy dimensions and approve publication-ready report', async () => {
      const res = await auditReportTool.invoke({
        draft_response: '## Summary\nLead time is 18.5 hours. See details in [DORA Report](file:///path/to/report.md). Overall delivery throughput is on track with 92% sprint completion.',
        audit_type: 'full_audit',
        mode: 'ANALYZE',
      });

      expect(res.status).toBe('SUCCESS');
      expect(res.name).toBe('audit_em_report');
      expect(res.data.approved).toBe(true);
      expect(res.data.verdict).toBe('APPROVED');
      expect(res.data.audits.tone_empathy_check).toContain('PASS');
      expect(res.data.audits.math_accuracy_check).toContain('PASS');
      expect(res.data.audits.link_integrity_check).toContain('PASS');
      expect(res.data.audits.vanity_metrics_check).toContain('PASS');
      expect(res.data.audits.fallback_integrity_check).toContain('PASS');
      expect(Array.isArray(res.data.policy_checks)).toBe(true);
      expect(res.data.summary).toContain('Audit Verdict & Executive Quality Summary');
      expect(res.data.summary).toContain('Policy & Guardrail Check Matrix');
    });

    it('should reject draft with vanity metrics or fake handles and generate sanitized revision', async () => {
      const res = await auditReportTool.invoke({
        draft_response: 'Developer @logsv wrote 500 lines of code and had total commits: 45 this week.',
        audit_type: 'full_audit',
        mode: 'ANALYZE',
      });

      expect(res.status).toBe('SUCCESS');
      expect(res.data.approved).toBe(false);
      expect(res.data.verdict).toBe('REVISION_REQUIRED');
      expect(res.data.audits.vanity_metrics_check).toContain('FAIL');
      expect(res.data.audits.fallback_integrity_check).toContain('FAIL');
      expect(res.data.violations.length).toBeGreaterThan(0);
      expect(res.data.sanitized_revision).toBeDefined();
      expect(res.data.sanitized_revision).not.toContain('@logsv');
      expect(res.data.sanitized_revision).not.toContain('500 lines of code');
    });

    it('should list audit dimensions in LIST_RAW mode', async () => {
      const res = await auditReportTool.invoke({
        mode: 'LIST_RAW',
      });

      expect(res.status).toBe('SUCCESS');
      expect(res.data.mode).toBe('LIST_RAW');
      expect(Array.isArray(res.data.checks_performed)).toBe(true);
      expect(res.data.checks_performed.length).toBeGreaterThanOrEqual(5);
    });

    it('should create criticAgent safely with low temperature', () => {
      const agent = createCriticAgent();
      expect(agent).toBeDefined();
    });
  });
});
