import { env } from '../config/env';
import { createLogger } from '../lib/logger';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';
import { HttpError } from '../utils/httpError';
import type { LimitRule } from './rateLimiter';

const log = createLogger('slack');

export const isSlackConfigured = () => Boolean(env.SLACK_CLIENT_ID && env.SLACK_CLIENT_SECRET);

export function slackAuthorizeUrl(state: string): string {
  const url = new URL('https://slack.com/oauth/v2/authorize');
  url.searchParams.set('client_id', env.SLACK_CLIENT_ID ?? '');
  url.searchParams.set('scope', 'incoming-webhook');
  url.searchParams.set('redirect_uri', env.SLACK_REDIRECT_URI);
  url.searchParams.set('state', state);
  return url.toString();
}

interface SlackOAuthResponse {
  ok: boolean;
  error?: string;
  access_token?: string;
  team?: { id: string; name: string };
  incoming_webhook?: { url: string; channel: string; channel_id: string };
}

export async function completeSlackOAuth(userId: string, code: string) {
  const res = await fetch('https://slack.com/api/oauth.v2.access', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.SLACK_CLIENT_ID ?? '',
      client_secret: env.SLACK_CLIENT_SECRET ?? '',
      code,
      redirect_uri: env.SLACK_REDIRECT_URI,
    }),
  });
  const data = (await res.json()) as SlackOAuthResponse;
  if (!data.ok || !data.incoming_webhook || !data.team) {
    throw new HttpError(400, `Slack OAuth failed: ${data.error ?? 'missing webhook'}`);
  }

  const fields = {
    teamId: data.team.id,
    teamName: data.team.name,
    channel: data.incoming_webhook.channel,
    webhookUrl: data.incoming_webhook.url,
    accessToken: data.access_token ?? null,
  };
  const integration = await prisma.slackIntegration.upsert({
    where: { userId },
    create: { userId, ...fields },
    update: fields,
  });

  await postToWebhook(userId, integration.webhookUrl, {
    text: ':white_check_mark: ReachInbox Scheduler is connected. You will be notified here when a sender hits its hourly limit.',
  });
  return integration;
}

export async function disconnectSlack(userId: string) {
  const integration = await prisma.slackIntegration.findUnique({ where: { userId } });
  if (!integration) return;
  await prisma.slackIntegration.delete({ where: { userId } });
  if (integration.accessToken) {
    // Best effort: also revoke the token on Slack's side.
    await fetch('https://slack.com/api/auth.revoke', {
      method: 'POST',
      headers: { Authorization: `Bearer ${integration.accessToken}` },
    }).catch(() => undefined);
  }
}

async function postToWebhook(userId: string, webhookUrl: string, payload: object): Promise<boolean> {
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (res.ok) return true;

  const body = await res.text();
  log.warn(`webhook responded ${res.status}: ${body}`);
  // Webhook revoked / channel deleted / app uninstalled: drop the stale
  // integration so the UI shows "Connect Slack" again.
  if ([403, 404, 410].includes(res.status)) {
    await prisma.slackIntegration.deleteMany({ where: { userId, webhookUrl } });
  }
  return false;
}

export async function sendSlackTest(userId: string): Promise<void> {
  const integration = await prisma.slackIntegration.findUnique({ where: { userId } });
  if (!integration) throw new HttpError(400, 'Slack is not connected');
  const ok = await postToWebhook(userId, integration.webhookUrl, {
    text: ':wave: Test notification from ReachInbox Scheduler.',
  });
  if (!ok) throw new HttpError(502, 'Slack rejected the message; try reconnecting');
}

/**
 * Called by the worker when a limit is reached. The integration is looked up
 * on every call (not cached), so connecting/disconnecting takes effect
 * immediately without a restart. No integration => silently skip.
 * A Redis SET NX makes sure each (user, limit, window) is announced once even
 * with many workers hitting the limit at the same moment.
 */
export async function notifyRateLimitReached(params: {
  userId: string;
  rule: LimitRule;
  window: number;
  resumesAt: Date;
}): Promise<void> {
  const { userId, rule, window, resumesAt } = params;
  try {
    const integration = await prisma.slackIntegration.findUnique({ where: { userId } });
    if (!integration) return;

    const dedupeKey = `slack:notified:${userId}:${rule.prefix}:${window}`;
    const first = await redis.set(dedupeKey, '1', 'PX', env.RATE_LIMIT_WINDOW_MS * 2, 'NX');
    if (!first) return;

    const what =
      rule.kind === 'sender'
        ? `Sender *${rule.label}*`
        : rule.kind === 'campaign'
          ? 'Your campaign'
          : 'The global sending pool';
    const text = `:warning: ${what} reached its hourly limit of *${rule.limit}* emails. Remaining emails are queued and will resume at ${resumesAt.toISOString()}.`;

    const ok = await postToWebhook(userId, integration.webhookUrl, { text });
    if (!ok) await redis.del(dedupeKey);
    else log.info(`notified user ${userId}: ${rule.kind} limit reached (${rule.label})`);
  } catch (err) {
    // Notifications must never break sending.
    log.warn('failed to send rate limit notification', err);
  }
}
