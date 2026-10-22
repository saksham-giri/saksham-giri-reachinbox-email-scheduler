import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { createLogger } from '../lib/logger';
import { prisma } from '../lib/prisma';
import { emailJob, emailQueue } from '../queue/emailQueue';
import { chunk } from '../utils/chunk';
import { htmlToText, sanitizeEmailHtml } from '../utils/html';
import { HttpError } from '../utils/httpError';
import { SCHEDULED_STATUSES } from './emailDto';
import { indexEmailsById } from './searchService';
import { listSenders } from './senderService';

const log = createLogger('scheduler');

export const scheduleCampaignSchema = z.object({
  subject: z.string().trim().min(1, 'Subject is required').max(300),
  body: z
    .string()
    .max(200_000)
    .transform(sanitizeEmailHtml)
    .refine((html) => htmlToText(html).length > 0, 'Body is required'),
  recipients: z.array(z.string()).min(1, 'At least one recipient is required').max(10_000),
  startAt: z.coerce.date(),
  delayBetweenSeconds: z.coerce.number().int().min(0).max(24 * 3600),
  hourlyLimit: z.coerce.number().int().min(1).max(100_000).nullish(),
  /** Send everything from one sender; omitted = rotate across all senders. */
  senderId: z.string().uuid().nullish(),
});

export type ScheduleCampaignInput = z.infer<typeof scheduleCampaignSchema>;

const emailSchema = z.string().email();

function normalizeRecipients(raw: string[]) {
  const seen = new Set<string>();
  const valid: string[] = [];
  let invalid = 0;
  for (const r of raw) {
    const e = r.trim().toLowerCase();
    if (!emailSchema.safeParse(e).success) invalid++;
    else if (!seen.has(e)) {
      seen.add(e);
      valid.push(e);
    }
  }
  return { valid, invalid, duplicates: raw.length - invalid - valid.length };
}

/**
 * 1. Persist campaign + one Email row per recipient (status SCHEDULED).
 * 2. Enqueue one BullMQ delayed job per email (jobId = email id).
 *
 * Rows are written before jobs are enqueued: if the process dies in between,
 * the boot reconciliation (below) creates the missing jobs, and because
 * jobId === email id it can never create duplicates.
 */
export async function scheduleCampaign(userId: string, input: ScheduleCampaignInput) {
  const { valid, invalid, duplicates } = normalizeRecipients(input.recipients);
  if (valid.length === 0) throw new HttpError(400, 'No valid email addresses found');

  const allSenders = await listSenders();
  const senders = input.senderId ? allSenders.filter((s) => s.id === input.senderId) : allSenders;
  if (input.senderId && senders.length === 0) throw new HttpError(400, 'Unknown sender');
  if (senders.length === 0) throw new HttpError(503, 'No senders configured yet, try again shortly');

  const startMs = Math.max(input.startAt.getTime(), Date.now());
  const delayMs = input.delayBetweenSeconds * 1000;

  const campaign = await prisma.campaign.create({
    data: {
      userId,
      subject: input.subject,
      body: input.body,
      startAt: new Date(startMs),
      delayMs,
      hourlyLimit: input.hourlyLimit ?? null,
      totalEmails: valid.length,
    },
  });

  const rows: Prisma.EmailCreateManyInput[] = valid.map((toEmail, i) => ({
    id: randomUUID(),
    campaignId: campaign.id,
    userId,
    // Round-robin across the sender pool spreads load over per-sender limits.
    senderId: senders[i % senders.length].id,
    toEmail,
    sequence: i,
    scheduledAt: new Date(startMs + i * delayMs),
  }));

  for (const batch of chunk(rows, 1000)) {
    await prisma.email.createMany({ data: batch });
  }
  for (const batch of chunk(rows, 500)) {
    await emailQueue.addBulk(batch.map((r) => emailJob({ id: r.id!, scheduledAt: r.scheduledAt as Date })));
  }
  log.info(`campaign ${campaign.id}: scheduled ${rows.length} email(s) starting ${new Date(startMs).toISOString()}`);

  // Fire-and-forget: search indexing must not slow down or fail the request.
  void indexEmailsById(rows.map((r) => r.id!));

  return { campaign, scheduled: rows.length, skippedInvalid: invalid, skippedDuplicates: duplicates };
}

/**
 * Runs on worker boot. Postgres is the source of truth: every email that is
 * still pending must have a BullMQ job. Normally Redis (with AOF) already has
 * them all and this is a no-op; it covers a crash between DB insert and
 * enqueue, or a Redis that lost its data. Existing jobs are left untouched,
 * so nothing is restarted from scratch or sent twice.
 */
export async function reconcilePendingEmails(): Promise<number> {
  let cursor: string | undefined;
  let restored = 0;
  for (;;) {
    const page = await prisma.email.findMany({
      where: { status: { in: SCHEDULED_STATUSES } },
      select: { id: true, scheduledAt: true },
      // Schedule order, so overdue emails re-enter the queue (FIFO) in the order they were meant to go out.
      orderBy: [{ scheduledAt: 'asc' }, { sequence: 'asc' }, { id: 'asc' }],
      take: 1000,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (page.length === 0) break;
    cursor = page[page.length - 1].id;

    const jobs = await Promise.all(page.map((e) => emailQueue.getJob(e.id)));
    const missing = page.filter((_, i) => !jobs[i]);
    if (missing.length > 0) {
      await emailQueue.addBulk(missing.map(emailJob));
      restored += missing.length;
    }
  }
  if (restored > 0) log.warn(`reconciliation re-enqueued ${restored} email job(s) missing from Redis`);
  else log.info('reconciliation: all pending emails have jobs');
  return restored;
}
