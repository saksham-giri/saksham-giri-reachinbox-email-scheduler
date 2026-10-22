import { Queue, type JobsOptions } from 'bullmq';
import { env } from '../config/env';
import { createRedis } from '../lib/redis';

export const EMAIL_QUEUE_NAME = 'email-send';

export interface EmailJobData {
  emailId: string;
}

export const emailQueue = new Queue<EmailJobData>(EMAIL_QUEUE_NAME, {
  connection: createRedis(),
  defaultJobOptions: {
    attempts: env.JOB_ATTEMPTS,
    backoff: { type: 'exponential', delay: 10_000 },
    // Keep history bounded; the DB is the source of truth for sent/failed emails.
    removeOnComplete: { age: 7 * 24 * 3600, count: 10_000 },
    removeOnFail: { age: 30 * 24 * 3600 },
  },
});

/**
 * jobId === email id: BullMQ ignores an add() whose jobId already exists, so
 * re-enqueuing the same email (retries of the API call, boot reconciliation)
 * can never create a second job for it.
 */
export function emailJob(email: { id: string; scheduledAt: Date }): {
  name: string;
  data: EmailJobData;
  opts: JobsOptions;
} {
  return {
    name: 'send',
    data: { emailId: email.id },
    opts: { jobId: email.id, delay: Math.max(0, email.scheduledAt.getTime() - Date.now()) },
  };
}
