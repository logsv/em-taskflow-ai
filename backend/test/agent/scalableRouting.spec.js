import { classifyFastPath } from '../../src/agent/llmRouter.js';
import chatApplicationService from '../../src/application/chat/ChatApplicationService.js';

describe('Scalable Metadata-Driven Attachment & Routing Architecture', () => {
  it('should route structured options.attachments directly to ATTACHMENT_DIRECT without substring regexes', () => {
    const query = 'Summarize key points';
    const options = {
      attachments: [
        { filename: 'Resume.pdf', content: 'Skills: Python, Node.js', mimeType: 'application/pdf' },
      ],
    };

    const result = classifyFastPath(query, options);
    expect(result).not.toBeNull();
    expect(result.intent_type).toBe('ATTACHMENT_DIRECT');
    expect(result.domains).toEqual([]);
    expect(result.must_use_tools).toBeFalse();
    expect(result.allow_rag).toBeFalse();
  });

  it('should normalize attachments cleanly from structured payload or legacy prompt', () => {
    const structured = chatApplicationService.normalizeAttachments('List skills', [
      { filename: 'doc.pdf', content: 'Text' },
    ]);
    expect(structured.length).toBe(1);
    expect(structured[0].filename).toBe('doc.pdf');

    const legacy = chatApplicationService.normalizeAttachments(
      '[Attachment: Vikas_Resume.pdf]\nSkills: PHP, MySQL'
    );
    expect(legacy.length).toBe(1);
    expect(legacy[0].filename).toBe('Vikas_Resume.pdf');
  });

  it('should allow explicit tool invocation when attachment query mentions Jira or GitHub', () => {
    const query = 'Create a Jira ticket from this attachment';
    const options = {
      attachments: [{ filename: 'bug.pdf', content: 'Error log' }],
    };

    const result = classifyFastPath(query, options);
    expect(result).toBeNull(); // Proceeds to multi-agent router
  });
});
