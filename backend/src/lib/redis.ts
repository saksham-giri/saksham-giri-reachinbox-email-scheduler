import IORedis from 'ioredis';
import { env } from '../config/env';

// BullMQ requires maxRetriesPerRequest: null on its connections.
export function createRedis() {
  return new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
}

// Shared connection for app-level keys (rate-limit counters, locks, dedupe flags).
export const redis = createRedis();
