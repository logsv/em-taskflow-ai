import { redisCandidateUrls, reconnectDelay, connectRedis } from '../../src/cache/redisConnect.js';

describe('redisConnect', () => {
  it('uses REDIS_URL alone when it is set, else compose host then localhost', () => {
    expect(redisCandidateUrls({ REDIS_URL: 'redis://cache:6380' })).toEqual(['redis://cache:6380']);
    expect(redisCandidateUrls({})).toEqual(['redis://redis:6379', 'redis://localhost:6379']);
  });

  it('keeps reconnecting after a drop with capped backoff (never gives up)', () => {
    expect(reconnectDelay(1)).toBe(200);
    expect(reconnectDelay(3)).toBe(600);
    expect(reconnectDelay(1000)).toBe(5000);
  });

  it('returns null quickly when no Redis is reachable', async () => {
    const started = Date.now();
    const client = await connectRedis({}, { REDIS_URL: 'redis://127.0.0.1:1' });
    expect(client).toBeNull();
    expect(Date.now() - started).toBeLessThan(5000);
  });
});
