import { randomUUID } from 'node:crypto';
import { createClient } from 'redis';
import { RedisStore } from 'rate-limit-redis';
import type { Store } from 'express-rate-limit';
import { env } from './env.js';

const redisUrl =
  env.RATE_LIMIT_REDIS_URL ??
  (env.NODE_ENV === 'development' ? 'redis://127.0.0.1:6379' : undefined);

const redisClient =
  env.NODE_ENV === 'test' && !redisUrl
    ? undefined
    : redisUrl
      ? createClient({
          url: redisUrl,
          socket: {
            connectTimeout: 5000,
            reconnectStrategy: (retries) =>
              retries > 5
                ? new Error('Redis connection retries exceeded.')
                : Math.min(retries * 200, 1000),
          },
        })
      : undefined;
const testNamespace = env.NODE_ENV === 'test' ? `${randomUUID()}:` : '';

redisClient?.on('error', (error: Error) => {
  console.error('Rate-limit Redis client error.', { type: error.name });
});

export function createRateLimitStore(namespace: string): Store | undefined {
  if (!redisClient) return undefined;
  return new RedisStore({
    prefix: `the-fashion-store:rate-limit:${testNamespace}${namespace}:`,
    sendCommand: (...args) => redisClient.sendCommand(args),
  });
}

export async function connectRateLimitRedis(): Promise<void> {
  if (!redisClient) {
    if (env.NODE_ENV === 'test') return;
    throw new Error('RATE_LIMIT_REDIS_URL is required for API rate limiting.');
  }

  try {
    if (!redisClient.isOpen) await redisClient.connect();
    const response = await redisClient.ping();
    if (response !== 'PONG') throw new Error('Unexpected Redis health response.');
  } catch (error) {
    throw new Error(
      `Rate-limit Redis is unavailable (${error instanceof Error ? error.name : 'unknown'}).`,
    );
  }
}

export function isRateLimitRedisReady(): boolean {
  return redisClient ? redisClient.isReady : env.NODE_ENV === 'test';
}

export async function disconnectRateLimitRedis(): Promise<void> {
  if (redisClient?.isOpen) await redisClient.quit();
}
