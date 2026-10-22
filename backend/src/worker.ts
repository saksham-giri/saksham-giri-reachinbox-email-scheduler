import { Worker } from 'bullmq';
import { env } from './config/env';
import { createLogger } from './lib/logger';
import { prisma } from './lib/prisma';
import { createRedis, redis } from './lib/redis';
import { EMAIL_QUEUE_NAME, emailQueue, type EmailJobData } from './queue/emailQueue';
import { closeTransports } from './services/mailer';
import { reconcilePendingEmails } from './services/schedulerService';
import { ensureSearchIndex } from './services/searchService';
import { processEmailJob, type EmailJobResult } from './workers/emailProcessor';

const log = createLogger('worker');

async function main() {
  await ensureSearchIndex();

  const worker = new Worker<EmailJobData, EmailJobResult>(EMAIL_QUEUE_NAME, processEmailJob, {
    connection: createRedis(),
    concurrency: env.WORKER_CONCURRENCY,
    // The minimum gap between sends is enforced in the processor with a Redis
    // send slot (see reserveSendSlot) rather than BullMQ's limiter, so that
    // rescheduling rate-limited jobs is not throttled along with real sends.
    // A job whose worker died is detected as stalled and handed to another worker.
    lockDuration: 60_000,
    stalledInterval: 30_000,
  });

  worker.on('failed', (job, err) => log.warn(`job ${job?.id} failed: ${err.message}`));
  worker.on('error', (err) => log.error('worker error', err));

  await reconcilePendingEmails();
  log.info(
    `listening on "${EMAIL_QUEUE_NAME}" (concurrency=${env.WORKER_CONCURRENCY}, minInterval=${env.MIN_SEND_INTERVAL_MS}ms, perSender=${env.MAX_EMAILS_PER_HOUR_PER_SENDER}/window, window=${env.RATE_LIMIT_WINDOW_MS}ms)`,
  );

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info(`${signal} received, finishing in-flight jobs...`);
    // close() waits for active jobs; delayed jobs stay in Redis untouched.
    await worker.close();
    await emailQueue.close();
    closeTransports();
    await Promise.all([prisma.$disconnect(), redis.quit()]);
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  log.error('worker failed to start', err);
  process.exit(1);
});
