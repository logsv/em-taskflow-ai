import { Redis } from 'ioredis';

/** Candidate Redis URLs: REDIS_URL if set, else the compose service name, then localhost. */
export function redisCandidateUrls(env = process.env) {
  if (env.REDIS_URL) return [env.REDIS_URL];
  return ['redis://redis:6379', 'redis://localhost:6379'];
}

/** Reconnect backoff once a connection has been established: 200ms, 400ms, ... capped at 5s. */
export function reconnectDelay(times) {
  return Math.min(times * 200, 5000);
}

/**
 * Connect to the first reachable Redis. The first attempt fails fast (so startup is not held up
 * when Redis is absent), but once connected the client keeps reconnecting after a drop instead of
 * staying on the in-memory fallback for the life of the process.
 *
 * @param {object} handlers
 * @param {(available: boolean) => void} handlers.onAvailability called on ready (true) / error or end (false)
 * @param {(err: Error) => void} [handlers.onError]
 * @returns {Promise<import('ioredis').Redis | null>}
 */
export async function connectRedis({ onAvailability, onError } = {}, env = process.env) {
  for (const url of redisCandidateUrls(env)) {
    const client = await tryConnect(url);
    if (client) {
      client.on('ready', () => onAvailability?.(true));
      client.on('error', (err) => { onAvailability?.(false); onError?.(err); });
      client.on('end', () => onAvailability?.(false));
      return client;
    }
  }
  return null;
}

function tryConnect(url) {
  return new Promise((resolve) => {
    let connected = false;
    const client = new Redis(url, {
      maxRetriesPerRequest: 1,
      retryStrategy(times) {
        if (!connected) return times > 1 ? null : 100;
        return reconnectDelay(times);
      },
    });
    const onInitialError = () => {
      if (connected) return;
      client.disconnect();
      resolve(null);
    };
    client.once('error', onInitialError);
    client.once('ready', () => {
      connected = true;
      client.removeListener('error', onInitialError);
      resolve(client);
    });
  });
}
