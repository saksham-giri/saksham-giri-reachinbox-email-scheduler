import { Router } from 'express';
import { env } from '../config/env';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';
import { requireAuth } from '../middleware/auth';
import { es } from '../services/searchService';
import { listSenders } from '../services/senderService';
import { asyncHandler } from '../utils/asyncHandler';

export const metaRouter = Router();

metaRouter.get(
  '/health',
  asyncHandler(async (_req, res) => {
    const check = (p: Promise<unknown>) => p.then(() => 'up').catch(() => 'down');
    const [db, cache, search] = await Promise.all([
      check(prisma.$queryRaw`SELECT 1`),
      check(redis.ping()),
      check(es.ping()),
    ]);
    res.status(db === 'up' && cache === 'up' ? 200 : 503).json({ db, redis: cache, elasticsearch: search });
  }),
);

metaRouter.get(
  '/config',
  requireAuth,
  asyncHandler(async (_req, res) => {
    const senders = await listSenders();
    res.json({
      senders: senders.map((s) => ({ id: s.id, name: s.name, email: s.email })),
      limits: {
        maxPerHourPerSender: env.MAX_EMAILS_PER_HOUR_PER_SENDER,
        maxPerHourGlobal: env.MAX_EMAILS_PER_HOUR || null,
        minSendIntervalMs: env.MIN_SEND_INTERVAL_MS,
        windowMs: env.RATE_LIMIT_WINDOW_MS,
        workerConcurrency: env.WORKER_CONCURRENCY,
      },
    });
  }),
);
