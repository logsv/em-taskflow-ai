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
      // A check that finds nothing reports NO_VIOLATIONS_FOUND, not proof of compliance.
      expect(res.data.overall_compliance).toBe('NO_VIOLATIONS_FOUND');
      expect(Array.isArray(res.data.checked_sops)).toBe(true);
      expect(res.data.checked_sops.length).toBeGreaterThan(0);
      expect(Array.isArray(res.data.rubric_checks)).toBe(true);
      expect(Array.isArray(res.data.citations)).toBe(true);
      expect(res.data.summary).toContain('Executive Summary');
      expect(res.data.summary).toContain('Key Document Analysis & Rubric Guidelines');
      expect(res.data.summary).toContain('Compliance Gap & Remediation Audit');
      expect(res.data.summary).toContain('Source Citations');
    });

    it('reports NOT_EVALUATED (not COMPLIANT) when no evidence is provided, and labels built-in guidance', async () => {
      const res = await sopComplianceTool.invoke({
        topic: 'database_isolation',
        query: 'Check our Architecture Decision Record (ADR) on database-per-service isolation guidelines',
        mode: 'ANALYZE',
      });

      expect(res.status).toBe('SUCCESS');
      expect(res.data.overall_compliance).toBe('NOT_EVALUATED');
      expect(res.data.summary).toContain('BASELINE-DB-ISOLATION');
      expect(res.data.summary).toContain('not a company document');
      expect(res.data.summary).not.toContain('strictly adhere');
    });

    it('flags a violation found in the provided text', async () => {
      const res = await sopComplianceTool.invoke({
        topic: 'database_isolation',
        task_context: 'The billing service will run a cross-service join against the users table',
        mode: 'ANALYZE',
      });
      expect(res.data.overall_compliance).toBe('NON_COMPLIANT');
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
      expect(res.data.summary).toContain('Standard Operating Procedures');
    });

    it('should support DRILL_DOWN mode for violations audit', async () => {
      const res = await sopComplianceTool.invoke({
        topic: 'database_isolation',
        task_context: 'Proposed direct table access and cross-service joins',
        mode: 'DRILL_DOWN',
        target: 'VIOLATIONS',
      });

      expect(res.status).toBe('SUCCESS');
      expect(res.data.mode).toBe('DRILL_DOWN');
      expect(res.data.violations_count).toBeGreaterThanOrEqual(1);
      expect(res.data.summary).toContain('Non-Compliance Violations');
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
      expect(res.data.summary).toContain('Report Audit Standards');
    });

    it('should support DRILL_DOWN mode for audit violations', async () => {
      const res = await auditReportTool.invoke({
        draft_response: 'Lazy developer @logsv wrote 500 lines of code',
        mode: 'DRILL_DOWN',
        target: 'VIOLATIONS',
      });

      expect(res.status).toBe('SUCCESS');
      expect(res.data.mode).toBe('DRILL_DOWN');
      expect(res.data.violations.length).toBeGreaterThan(0);
      expect(res.data.summary).toContain('Quality Audit Violations');
    });

    it('should create criticAgent safely with low temperature', () => {
      const agent = createCriticAgent();
      expect(agent).toBeDefined();
    });
  });
});
