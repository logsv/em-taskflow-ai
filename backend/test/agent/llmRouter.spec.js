import { classifyFastPath } from '../../src/agent/llmRouter.js';

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
});
