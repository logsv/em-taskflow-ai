import { hasKeyword } from '../../src/utils/keywords.js';

describe('hasKeyword (word-boundary routing keywords)', () => {
  it('does not match short tokens inside other words', () => {
    expect(hasKeyword('describe our hiring process', 'pr')).toBeFalse();
    expect(hasKeyword('improve our approach', 'pr')).toBeFalse();
    expect(hasKeyword('how does the network work', 'kr')).toBeFalse();
    expect(hasKeyword('leadership training', 'adr')).toBeFalse();
  });

  it('matches short tokens as whole words, including plurals and punctuation', () => {
    expect(hasKeyword('list open pr', 'pr')).toBeTrue();
    expect(hasKeyword('which prs are stalled?', 'pr')).toBeTrue();
    expect(hasKeyword('review pr#42 now', 'pr')).toBeTrue();
    expect(hasKeyword('okr/kr pacing', 'kr')).toBeTrue();
  });

  it('lets longer tokens match at the start of a word', () => {
    expect(hasKeyword('generate a sprint retrospective', 'retro')).toBeTrue();
    expect(hasKeyword('deployment frequency', 'deploy')).toBeTrue();
    expect(hasKeyword('metro line delays', 'retro')).toBeFalse();
  });

  it('treats doc as a prefix stem', () => {
    expect(hasKeyword('summarize the document', 'doc')).toBeTrue();
    expect(hasKeyword('check the docs', 'doc')).toBeTrue();
    expect(hasKeyword('the doctor said', 'doc')).toBeTrue(); // accepted false positive for the doc stem
  });

  it('is safe on non-string input', () => {
    expect(hasKeyword(undefined, 'pr')).toBeFalse();
    expect(hasKeyword('pr', '')).toBeFalse();
  });
});
