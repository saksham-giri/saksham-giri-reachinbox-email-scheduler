import { DelayedError, type Job } from 'bullmq';
import { createLogger } from '../lib/logger';
import { prisma } from '../lib/prisma';
import type { EmailJobData } from '../queue/emailQueue';
import { indexEmail } from '../services/searchService';
import { sendEmail } from '../services/mailer';
import { consume, release, reserveFutureSlot, reserveSendSlot, rulesFor, windowStart } from '../services/rateLimiter';
import { notifyRateLimitReached } from '../services/slackService';

const log = createLogger('worker');

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** A PROCESSING email whose lock is older than this belongs to a dead worker. */
const STALE_LOCK_MS = 2 * 60_000;

export type EmailJobResult = { status: 'sent'; messageId: string } | { status: 'skipped'; reason: string };

export async function processEmailJob(job: Job<EmailJobData>, token?: string): Promise<EmailJobResult> {
  const { emailId } = job.data;
  const now = Date.now();

  // --- 1. Claim (idempotency) -------------------------------------------------
  // Conditional UPDATE: only one worker can move the row into PROCESSING, and
  // an already SENT/FAILED email is never picked up again, no matter how many
  // times its job is delivered.
  const claimed = await prisma.email.updateMany({
    where: {
      id: emailId,
      OR: [
        { status: { in: ['SCHEDULED', 'DELAYED'] } },
        { status: 'PROCESSING', lockedAt: { lt: new Date(now - STALE_LOCK_MS) } },
      ],
    },
    data: { status: 'PROCESSING', lockedAt: new Date(now) },
  });

  if (claimed.count === 0) {
    const current = await prisma.email.findUnique({ where: { id: emailId }, select: { status: true, lockedAt: true } });
    if (current?.status === 'PROCESSING' && current.lockedAt) {
      // Another (possibly crashed) worker holds it; check again once its lock goes stale.
      await job.moveToDelayed(current.lockedAt.getTime() + STALE_LOCK_MS + 1000, token);
      throw new DelayedError();
    }
    const reason = current ? `already ${current.status}` : 'email no longer exists';
    log.info(`skip ${emailId}: ${reason}`);
    return { status: 'skipped', reason };
  }

  const email = await prisma.email.findUniqueOrThrow({
    where: { id: emailId },
    include: { sender: true, campaign: true },
  });

  // --- 2. Hourly limits (Redis counters shared by all workers) --------------
  const rules = rulesFor(email, { senderEmail: email.sender.email, campaignLimit: email.campaign.hourlyLimit });
  const quota = await consume(rules, now);
  const nextWindowAt = new Date(windowStart(quota.window + 1));

  if (!quota.allowed && quota.blockedBy) {
    const runAt = await reserveFutureSlot(quota.blockedBy, quota.window);
    await prisma.email.update({
      where: { id: emailId },
      data: { status: 'DELAYED', scheduledAt: new Date(runAt), lockedAt: null, deferrals: { increment: 1 } },
    });
    void notifyRateLimitReached({ userId: email.userId, rule: quota.blockedBy, window: quota.window, resumesAt: nextWindowAt });
    void indexEmail(emailId);
    log.info(`defer ${emailId}: ${quota.blockedBy.kind} limit ${quota.blockedBy.limit}/window hit, rescheduled to ${new Date(runAt).toISOString()}`);

    // Not a failure: the job goes back to the delayed set and keeps its attempts.
    await job.moveToDelayed(runAt, token);
    throw new DelayedError();
  }

  // --- 3. Minimum gap between sends (global send slot) ----------------------
  const slot = await reserveSendSlot();
  if (!slot.granted) {
    // Every slot in the near future is taken (many workers): hand the hourly
    // quota back and retry when the next slot frees up.
    await release(rules, quota.window);
    await prisma.email.update({
      where: { id: emailId },
      data: { status: email.deferrals > 0 ? 'DELAYED' : 'SCHEDULED', lockedAt: null },
    });
    await job.moveToDelayed(slot.at, token);
    throw new DelayedError();
  }
  if (slot.at > Date.now()) await sleep(slot.at - Date.now());

  // Announce only once this send is certain, so a released quota never notifies.
  for (const rule of quota.reached) {
    void notifyRateLimitReached({ userId: email.userId, rule, window: quota.window, resumesAt: nextWindowAt });
  }

  // --- 4. Send ---------------------------------------------------------------
  try {
    const result = await sendEmail(email.sender, {
      id: email.id,
      to: email.toEmail,
      subject: email.campaign.subject,
      html: email.campaign.body,
    });
    await prisma.email.update({
      where: { id: emailId },
      data: {
        status: 'SENT',
        sentAt: new Date(),
        lockedAt: null,
        attempts: { increment: 1 },
        messageId: result.messageId,
        previewUrl: result.previewUrl,
        error: null,
      },
    });
    void indexEmail(emailId);
    log.info(`sent ${emailId} -> ${email.toEmail} via ${email.sender.email}`);
    return { status: 'sent', messageId: result.messageId };
  } catch (err) {
    // The message did not go out, so hand its rate-limit slot back.
    await release(rules, quota.window).catch(() => undefined);

    const message = err instanceof Error ? err.message : String(err);
    const isFinal = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
    await prisma.email.update({
      where: { id: emailId },
      data: {
        // SCHEDULED again so the BullMQ retry can claim it; FAILED is terminal.
        status: isFinal ? 'FAILED' : 'SCHEDULED',
        sentAt: isFinal ? new Date() : null,
        lockedAt: null,
        attempts: { increment: 1 },
        error: message,
      },
    });
    void indexEmail(emailId);
    log.warn(`send ${emailId} failed (attempt ${job.attemptsMade + 1}${isFinal ? ', final' : ''}): ${message}`);
    throw err;
  }
}
