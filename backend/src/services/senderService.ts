import type { Sender } from '@prisma/client';
import { z } from 'zod';
import { env } from '../config/env';
import { createLogger } from '../lib/logger';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';

const log = createLogger('senders');

const configuredSendersSchema = z.array(
  z.object({
    name: z.string().optional(),
    user: z.string().email(),
    pass: z.string().min(1),
    host: z.string().default('smtp.ethereal.email'),
    port: z.number().int().default(587),
    secure: z.boolean().default(false),
  }),
);

interface EtherealAccount {
  user: string;
  pass: string;
  smtp: { host: string; port: number; secure: boolean };
}

/**
 * nodemailer.createTestAccount() caches its account for the life of the
 * process, so calling it N times yields one mailbox. Hit the same Ethereal
 * endpoint directly to get N distinct senders.
 */
async function createEtherealAccount(): Promise<EtherealAccount> {
  const res = await fetch('https://api.nodemailer.com/user', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestor: 'reachinbox-scheduler', version: '1.0.0' }),
  });
  const data = (await res.json()) as EtherealAccount & { status: string; error?: string };
  if (!res.ok || data.status !== 'success') throw new Error(`Ethereal account creation failed: ${data.error ?? res.status}`);
  return data;
}

/**
 * Makes sure the sender pool exists. Senders are stored in the DB so that the
 * same Ethereal mailboxes are reused across restarts (and their inboxes keep
 * the history). Guarded by a Redis lock so concurrent API instances do not
 * each create their own accounts.
 */
export async function ensureSenders(): Promise<void> {
  const lock = await redis.set('lock:ensure-senders', '1', 'EX', 60, 'NX');
  if (!lock) return;
  try {
    if (env.ETHEREAL_SENDERS) {
      const configured = configuredSendersSchema.parse(JSON.parse(env.ETHEREAL_SENDERS));
      for (const [i, s] of configured.entries()) {
        const data = {
          name: s.name ?? `Sender ${i + 1}`,
          smtpHost: s.host,
          smtpPort: s.port,
          smtpSecure: s.secure,
          smtpUser: s.user,
          smtpPass: s.pass,
        };
        await prisma.sender.upsert({ where: { email: s.user }, create: { email: s.user, ...data }, update: data });
      }
      log.info(`loaded ${configured.length} sender(s) from ETHEREAL_SENDERS`);
      return;
    }

    const existing = await prisma.sender.count();
    for (let i = existing; i < env.ETHEREAL_SENDER_COUNT; i++) {
      const account = await createEtherealAccount();
      await prisma.sender.create({
        data: {
          name: `Sender ${i + 1}`,
          email: account.user,
          smtpHost: account.smtp.host,
          smtpPort: account.smtp.port,
          smtpSecure: account.smtp.secure,
          smtpUser: account.user,
          smtpPass: account.pass,
        },
      });
      log.info(`created Ethereal sender ${account.user}`);
    }
  } finally {
    await redis.del('lock:ensure-senders');
  }
}

export function listSenders(): Promise<Sender[]> {
  return prisma.sender.findMany({ orderBy: { createdAt: 'asc' } });
}
