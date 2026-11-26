/** Max characters of attachment text sent to the local model (same limit the chat UI uses). */
export const MAX_ATTACHMENT_CHARS = 20000;

/**
 * Prompt block for chat attachments whose text is not already in the message.
 * @param {Array<{filename?: string, content?: string}>} attachments
 * @param {string} query
 * @returns {string} '' when there is nothing to add
 */
export function buildAttachmentContext(attachments, query = '') {
  if (!Array.isArray(attachments) || attachments.length === 0) return '';
  const q = String(query || '');
  let budget = MAX_ATTACHMENT_CHARS;
  const blocks = [];
  for (const a of attachments) {
    const text = String(a?.content || '').trim();
    if (!text || budget <= 0) continue;
    // Already in the message (the UI pastes "[Attachment: name]\n<text>" into the input).
    if (q.includes(text)) continue;
    const slice = text.slice(0, budget);
    budget -= slice.length;
    const truncated = slice.length < text.length ? `\n[...truncated ${text.length - slice.length} characters]` : '';
    blocks.push(`[Attachment: ${a?.filename || 'file'}]\n${slice}${truncated}`);
  }
  return blocks.join('\n\n');
}
