import {
  optimizeChatHistory,
  sanitizeMessagePayload,
  collapseDetailsAccordions,
  condenseMarkdownTables,
  condenseAssistantContent,
} from '../../src/application/chat/ChatApplicationService.js';

describe('Chat History Pre-LLM Optimization & Progressive Condensation', () => {
  it('should return raw messages when count is less than threshold', () => {
    const messages = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there!' },
    ];
    const result = optimizeChatHistory(messages, 8);
    expect(result.length).toBe(2);
    expect(result[0].content).toBe('Hello');
    expect(result[1].content).toBe('Hi there!');
  });

  it('should apply sliding window and state summary anchor when messages exceed threshold', () => {
    const messages = [];
    for (let i = 1; i <= 15; i++) {
      messages.push({ role: 'user', content: `Query number ${i}` });
      messages.push({ role: 'assistant', content: `Response number ${i}` });
    }
    // Total 30 messages
    const result = optimizeChatHistory(messages, 8);

    // Should return 1 system anchor + 8 active messages = 9
    expect(result.length).toBe(9);
    expect(result[0].role).toBe('system');
    expect(result[0].content).toContain('[System Memory: Conversation Summary Anchor]');
    expect(result[0].content).toContain('22 earlier turns archived');

    // Last message should be response 15
    expect(result[8].content).toBe('Response number 15');
  });

  describe('Tier 1: Payload Sanitization (sanitizeMessagePayload)', () => {
    it('should strip trailing JSON metadata blocks', () => {
      const raw = `### 📊 DORA Performance Scorecard\nDeployment frequency: 3.73/wk\n\n{"selectedPath":"deterministic-domain-tool-recovery","mcpReady":true,"ragMode":"baseline","ragHit":false}`;
      const sanitized = sanitizeMessagePayload(raw);
      expect(sanitized).not.toContain('{"selectedPath"');
      expect(sanitized).toContain('### 📊 DORA Performance Scorecard');
    });

    it('should strip notice and provenance callout lines', () => {
      const raw = `> ✅ **Notice**: Fresh operational telemetry retrieved via Live GitHub MCP integration.\n\nKey Insights: All PRs merged.`;
      const sanitized = sanitizeMessagePayload(raw);
      expect(sanitized).not.toContain('Notice');
      expect(sanitized).toContain('Key Insights: All PRs merged.');
    });
  });

  describe('Tier 2: Accordion & Markdown Table Condensation', () => {
    it('should collapse multi-line <details> blocks', () => {
      const raw = `### Bottlenecks\n<details>\n<summary><b>🔍 Flow & Bottleneck Analysis</b></summary>\n- Review wait time is 13.58h\n- CI duration 15m\n</details>`;
      const collapsed = collapseDetailsAccordions(raw);
      expect(collapsed).toContain('[Collapsed Section: 🔍 Flow & Bottleneck Analysis]');
      expect(collapsed).not.toContain('Review wait time is 13.58h');
    });

    it('should condense markdown tables into compact key-value lines', () => {
      const rawTable = `| Metric | Measured Value | Industry Benchmark Tier | Health Status |
| :--- | :--- | :--- | :--- |
| **Deployment Frequency** | **3.73 deploys/week** | HIGH Tier | 🟢 Healthy |
| **Lead Time for Changes** | **19.4 hours** | HIGH Tier | 🟢 Rapid |
| **Change Failure Rate** | **0%** | HIGH Tier | 🟢 Stable |`;
      const condensed = condenseMarkdownTables(rawTable);
      expect(condensed).toContain('[Table Summary: Deployment Frequency: 3.73 deploys/week | Lead Time for Changes: 19.4 hours | Change Failure Rate: 0%]');
    });
  });

  describe('Tier 3 & 4: Progressive Condensation & Strict Budgeting', () => {
    it('should preserve high resolution for immediate prior turn and condense older active turns', () => {
      const messages = [
        {
          role: 'user',
          content: 'Analyze team DORA metrics',
        },
        {
          role: 'assistant',
          content: `### 📊 DORA Scorecard\n| Metric | Measured Value |\n| :--- | :--- |\n| Deploy Freq | 4.2/wk |\n| Lead Time | 12h |\n\n<details><summary><b>Details</b></summary>Long analysis text</details>\n\n{"selectedPath":"dora"}`,
        },
        {
          role: 'user',
          content: 'Check sprint delivery bottlenecks',
        },
        {
          role: 'assistant',
          content: `### 🚨 GitHub PRs\n| PR | Author |\n| :--- | :--- |\n| #123 | alex |\n\n<details><summary><b>WIP Details</b></summary>WIP text</details>`,
        },
      ];

      const result = optimizeChatHistory(messages, 8);
      expect(result.length).toBe(4);
      // Turn 1 assistant response (older turn in window) should have table condensed & JSON stripped
      expect(result[1].content).toContain('[Table Summary: Deploy Freq: 4.2/wk | Lead Time: 12h]');
      expect(result[1].content).not.toContain('{"selectedPath"');

      // Turn 2 assistant response (immediate prior turn) should have accordions collapsed
      expect(result[3].content).toContain('[Collapsed Section: WIP Details]');
    });

    it('should enforce hard character budget cap on bulky history', () => {
      const messages = [];
      for (let i = 1; i <= 6; i++) {
        messages.push({ role: 'user', content: `Detailed prompt question for sprint #${i} capacity and velocity analysis` });
        messages.push({
          role: 'assistant',
          content: `Executive Summary for Sprint #${i}:\n` + 'A'.repeat(800) + `\n{"selectedPath":"sprint"}`,
        });
      }

      const result = optimizeChatHistory(messages, 8, 2000);
      const totalChars = result.reduce((sum, m) => sum + m.content.length, 0);
      expect(totalChars).toBeLessThanOrEqual(2500);
    });
  });
});
