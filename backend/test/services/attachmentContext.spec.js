import { buildAttachmentContext, MAX_ATTACHMENT_CHARS } from '../../src/services/attachmentContext.js';

describe('buildAttachmentContext', () => {
  it('adds attachment text sent separately from the question', () => {
    const block = buildAttachmentContext([{ filename: 'release.pdf', content: 'The rollback owner is Marcus Lee.' }], 'Who is the rollback owner?');
    expect(block).toContain('[Attachment: release.pdf]');
    expect(block).toContain('Marcus Lee');
  });

  it('does not duplicate text the UI already pasted into the message', () => {
    const msg = '[Attachment: a.pdf]\nThe rollback owner is Marcus Lee.\n\nWho owns rollback?';
    expect(buildAttachmentContext([{ filename: 'a.pdf', content: msg }], msg)).toBe('');
  });

  it('caps the total attachment text and says it was truncated', () => {
    const big = 'x'.repeat(MAX_ATTACHMENT_CHARS + 500);
    const block = buildAttachmentContext([{ filename: 'big.txt', content: big }], 'q');
    expect(block).toContain('[...truncated 500 characters]');
  });

  it('returns empty for no or empty attachments', () => {
    expect(buildAttachmentContext([], 'q')).toBe('');
    expect(buildAttachmentContext([{ filename: 'e.pdf', content: '  ' }], 'q')).toBe('');
    expect(buildAttachmentContext(undefined, 'q')).toBe('');
  });
});
