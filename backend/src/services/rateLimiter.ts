import { env } from '../config/env';
import { redis } from '../lib/redis';

/**
 * Fixed-window hourly limits backed by Redis counters, so every worker process
 * on every machine shares the same numbers.
 *
 * Keys: rl:<kind>:<id>:<windowIndex>, where windowIndex = floor(now / WINDOW).
 */

export type LimitKind = 'sender' | 'campaign' | 'global';

export interface LimitRule {
  kind: LimitKind;
  /** Counter key prefix without the window suffix, e.g. "rl:sender:<id>" */
  prefix: string;
  limit: number;
  /** Human readable label used in notifications, e.g. the sender address */
  label: string;
}

export const windowMs = env.RATE_LIMIT_WINDOW_MS;
export const windowIndex = (ts: number) => Math.floor(ts / windowMs);
export const windowStart = (index: number) => index * windowMs;
const ttlSeconds = Math.ceil((windowMs * 2) / 1000);

export function rulesFor(
  email: { senderId: string; campaignId: string },
  ctx: { senderEmail: string; campaignLimit: number | null },
): LimitRule[] {
  const rules: LimitRule[] = [
    { kind: 'sender', prefix: `rl:sender:${email.senderId}`, limit: env.MAX_EMAILS_PER_HOUR_PER_SENDER, label: ctx.senderEmail },
  ];
  if (ctx.campaignLimit) {
    rules.push({ kind: 'campaign', prefix: `rl:campaign:${email.campaignId}`, limit: ctx.campaignLimit, label: 'campaign' });
  }
  if (env.MAX_EMAILS_PER_HOUR > 0) {
    rules.push({ kind: 'global', prefix: 'rl:global', limit: env.MAX_EMAILS_PER_HOUR, label: 'all senders' });
  }
  return rules;
}

/**
 * Atomically: if every counter is below its limit, increment all of them.
 * Check-then-increment happens inside one Lua script, so two workers can never
 * both take the last slot.
 *
 * Returns {blocked} (1-based index of the first full counter) or
 * {0, reached...} (indexes whose counter just hit its limit with this send).
 */
const CONSUME_LUA = `
local ttl = tonumber(ARGV[1])
for i = 1, #KEYS do
  local current = tonumber(redis.call('GET', KEYS[i]) or '0')
  if current >= tonumber(ARGV[i + 1]) then
    return { i }
  end
end
local result = { 0 }
for i = 1, #KEYS do
  local v = redis.call('INCR', KEYS[i])
  if v == 1 then redis.call('EXPIRE', KEYS[i], ttl) end
  if v == tonumber(ARGV[i + 1]) then result[#result + 1] = i end
end
return result
`;

export interface ConsumeResult {
  allowed: boolean;
  window: number;
  blockedBy?: LimitRule;
  /** Rules whose limit was reached by this very send (the "moment" the limit hits) */
  reached: LimitRule[];
}

export async function consume(rules: LimitRule[], now = Date.now()): Promise<ConsumeResult> {
  const window = windowIndex(now);
  const keys = rules.map((r) => `${r.prefix}:${window}`);
  const res = (await redis.eval(CONSUME_LUA, keys.length, ...keys, ttlSeconds, ...rules.map((r) => r.limit))) as number[];
  if (res[0] !== 0) return { allowed: false, window, blockedBy: rules[res[0] - 1], reached: [] };
  return { allowed: true, window, reached: res.slice(1).map((i) => rules[i - 1]) };
}

/**
 * Minimum gap between sends, shared by every worker. Each send claims the next
 * free time slot (>= previous slot + interval). Unlike BullMQ's `limiter`,
 * which charges every job start, only emails that are actually about to be
 * sent take a slot, so rescheduling a rate-limited backlog costs no throughput.
 *
 * Returns {1, slot} when the slot is reserved, or {0, slot} without reserving
 * when the next free slot is further away than maxWait.
 */
const PACE_LUA = `
local now = tonumber(ARGV[1])
local interval = tonumber(ARGV[2])
local maxWait = tonumber(ARGV[3])
local last = tonumber(redis.call('GET', KEYS[1]) or '0')
local slot = math.max(now, last + interval)
if slot - now > maxWait then
  return { 0, slot }
end
redis.call('SET', KEYS[1], slot, 'PX', maxWait + interval * 2)
return { 1, slot }
`;

export async function reserveSendSlot(now = Date.now()): Promise<{ granted: boolean; at: number }> {
  if (env.MIN_SEND_INTERVAL_MS === 0) return { granted: true, at: now };
  const maxWait = Math.max(10_000, env.MIN_SEND_INTERVAL_MS * env.WORKER_CONCURRENCY);
  const [granted, at] = (await redis.eval(PACE_LUA, 1, 'pace:send', now, env.MIN_SEND_INTERVAL_MS, maxWait)) as number[];
  return { granted: granted === 1, at };
}

/** Give a slot back, e.g. when a claimed send is abandoned before hitting SMTP. */
export async function release(rules: LimitRule[], window: number): Promise<void> {
  const pipeline = redis.pipeline();
  for (const r of rules) pipeline.decr(`${r.prefix}:${window}`);
  await pipeline.exec();
}

/**
 * Reserve a slot in the first future window that still has room for this
 * rule. Each window holds at most `limit` reservations, so a backlog of 1000
 * emails against a 50/hour sender is spread over the next 20 windows in one
 * pass instead of every job waking up each hour only to be pushed back again.
 *
 * Within a window the reserved slots are spaced evenly, in reservation order,
 * which keeps the original scheduling order.
 */
const RESERVE_LUA = `
local prefix = KEYS[1]
local w = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local ttl = tonumber(ARGV[3])
for _ = 1, 10000 do
  local key = prefix .. ':' .. w
  local n = redis.call('INCR', key)
  if n == 1 then redis.call('EXPIRE', key, ttl) end
  if n <= limit then
    return { w, n - 1 }
  end
  w = w + 1
end
return { w, 0 }
`;

export async function reserveFutureSlot(rule: LimitRule, fromWindow: number): Promise<number> {
  const firstWindow = fromWindow + 1;
  // The reservation key lives as long as the farthest window could be in use.
  const [w, position] = (await redis.eval(
    RESERVE_LUA,
    1,
    `rsv:${rule.prefix}`,
    firstWindow,
    rule.limit,
    ttlSeconds * 24,
  )) as number[];
  const spacing = Math.floor(windowMs / rule.limit);
  return windowStart(w) + position * spacing;
}
