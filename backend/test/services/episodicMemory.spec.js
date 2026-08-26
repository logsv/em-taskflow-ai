import { EpisodicMemoryService } from '../../src/services/episodicMemory.js';

describe('EpisodicMemoryService (Tier 4 Semantic Retrieval over Conversation History)', () => {
  it('returns empty array when query does not contain past temporal reference', async () => {
    const mockDb = {
      getThreadMessages: jasmine.createSpy('getThreadMessages'),
    };
    const service = new EpisodicMemoryService({ db: mockDb });
    const result = await service.retrieveRelevantPastContext('What is our DORA MTTR score?', 'th_123');

    expect(result).toEqual([]);
    expect(mockDb.getThreadMessages).not.toHaveBeenCalled();
  });

  it('retrieves relevant older message snippets when query refers to earlier turns', async () => {
    const mockDb = {
      getThreadMessages: jasmine.createSpy('getThreadMessages').and.resolveTo([
        { id: 1, role: 'user', content: 'What was the MTTR benchmark for Tier 1?', created_at: '2026-08-22T08:00:00Z' },
        { id: 2, role: 'assistant', content: 'The MTTR benchmark is < 2 hours for Elite Tier.', created_at: '2026-08-22T08:01:00Z' },
        { id: 3, role: 'user', content: 'Turn 3' },
        { id: 4, role: 'assistant', content: 'Turn 4' },
        { id: 5, role: 'user', content: 'Turn 5' },
        { id: 6, role: 'assistant', content: 'Turn 6' },
        { id: 7, role: 'user', content: 'Turn 7' },
        { id: 8, role: 'assistant', content: 'Turn 8' },
      ]),
    };
    const service = new EpisodicMemoryService({ db: mockDb });
    const result = await service.retrieveRelevantPastContext('What did you mention earlier about MTTR benchmark?', 'th_123');

    expect(mockDb.getThreadMessages).toHaveBeenCalledWith('th_123', 50);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].content).toContain('MTTR');
  });

  it('reuses in-memory existingMessages with 0 database queries', async () => {
    const mockDb = {
      getThreadMessages: jasmine.createSpy('getThreadMessages'),
    };
    const inMemoryMessages = [
      { id: 1, role: 'user', content: 'What was the MTTR benchmark for Tier 1?', created_at: '2026-08-22T08:00:00Z' },
      { id: 2, role: 'assistant', content: 'The MTTR benchmark is < 2 hours for Elite Tier.', created_at: '2026-08-22T08:01:00Z' },
      { id: 3, role: 'user', content: 'Turn 3' },
      { id: 4, role: 'assistant', content: 'Turn 4' },
      { id: 5, role: 'user', content: 'Turn 5' },
      { id: 6, role: 'assistant', content: 'Turn 6' },
      { id: 7, role: 'user', content: 'Turn 7' },
      { id: 8, role: 'assistant', content: 'Turn 8' },
    ];
    const service = new EpisodicMemoryService({ db: mockDb });
    const result = await service.retrieveRelevantPastContext(
      'What did you mention earlier about MTTR benchmark?',
      'th_123',
      2,
      inMemoryMessages
    );

    expect(mockDb.getThreadMessages).not.toHaveBeenCalled(); // ⚡ Verified: 0 extra DB queries!
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].content).toContain('MTTR');
  });
});
