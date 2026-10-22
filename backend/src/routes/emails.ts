import type { EmailStatus, Prisma } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { createLogger } from '../lib/logger';
import { prisma } from '../lib/prisma';
import { requireAuth, type AuthedRequest } from '../middleware/auth';
import { SCHEDULED_STATUSES, SENT_STATUSES, emailInclude, toEmailDTO } from '../services/emailDto';
import { emailQueue } from '../queue/emailQueue';
import { indexEmail, removeFromIndex, searchEmails } from '../services/searchService';
import { asyncHandler } from '../utils/asyncHandler';
import { HttpError } from '../utils/httpError';

const log = createLogger('emails');
export const emailsRouter = Router();
emailsRouter.use(requireAuth);

const listQuerySchema = z.object({
  type: z.enum(['scheduled', 'sent']).default('scheduled'),
  q: z.string().trim().max(200).optional(),
  status: z.enum(['SCHEDULED', 'PROCESSING', 'DELAYED', 'SENT', 'FAILED']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

emailsRouter.get(
  '/',
  asyncHandler<AuthedRequest>(async (req, res) => {
    const { type, q, status, page, pageSize } = listQuerySchema.parse(req.query);
    const tabStatuses = type === 'sent' ? SENT_STATUSES : SCHEDULED_STATUSES;
    // The status filter can only narrow the tab, never escape it.
    const statuses = status ? tabStatuses.filter((s) => s === status) : tabStatuses;

    if (q) {
      try {
        const result = await searchEmails({ userId: req.userId, query: q, statuses, page, pageSize });
        return res.json({ ...result, page, pageSize, source: 'elasticsearch' });
      } catch (err) {
        log.warn('Elasticsearch search failed, falling back to Postgres', err);
      }
    }

    const where: Prisma.EmailWhereInput = {
      userId: req.userId,
      status: { in: statuses },
      ...(q
        ? {
            OR: [
              { toEmail: { contains: q, mode: 'insensitive' } },
              { campaign: { subject: { contains: q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const orderBy: Prisma.EmailOrderByWithRelationInput[] =
      type === 'sent' ? [{ sentAt: 'desc' }, { updatedAt: 'desc' }] : [{ scheduledAt: 'asc' }, { sequence: 'asc' }];

    const [rows, total] = await Promise.all([
      prisma.email.findMany({ where, orderBy, include: emailInclude, skip: (page - 1) * pageSize, take: pageSize }),
      prisma.email.count({ where }),
    ]);
    res.json({ items: rows.map(toEmailDTO), total, page, pageSize, source: 'postgres' });
  }),
);

emailsRouter.get(
  '/stats',
  asyncHandler<AuthedRequest>(async (req, res) => {
    const grouped = await prisma.email.groupBy({ by: ['status'], where: { userId: req.userId }, _count: true });
    const byStatus = Object.fromEntries(grouped.map((g) => [g.status, g._count])) as Partial<Record<EmailStatus, number>>;
    const sum = (list: EmailStatus[]) => list.reduce((acc, s) => acc + (byStatus[s] ?? 0), 0);
    res.json({ scheduled: sum(SCHEDULED_STATUSES), sent: sum(SENT_STATUSES), byStatus });
  }),
);

emailsRouter.get(
  '/:id',
  asyncHandler<AuthedRequest>(async (req, res) => {
    const email = await prisma.email.findFirst({ where: { id: req.params.id, userId: req.userId }, include: emailInclude });
    if (!email) throw new HttpError(404, 'Email not found');
    res.json(toEmailDTO(email));
  }),
);

emailsRouter.patch(
  '/:id',
  asyncHandler<AuthedRequest>(async (req, res) => {
    const { starred } = z.object({ starred: z.boolean() }).parse(req.body);
    const updated = await prisma.email.updateMany({ where: { id: req.params.id, userId: req.userId }, data: { starred } });
    if (updated.count === 0) throw new HttpError(404, 'Email not found');
    void indexEmail(req.params.id);
    res.status(204).end();
  }),
);

/**
 * Deletes an email. For a pending email this cancels the send: the row is
 * removed with a conditional delete, so if a worker claimed it a moment
 * earlier the delete loses (409) and the email is sent normally. If the delete
 * wins, any job that still fires finds no row and is skipped.
 */
emailsRouter.delete(
  '/:id',
  asyncHandler<AuthedRequest>(async (req, res) => {
    const deleted = await prisma.email.deleteMany({
      where: { id: req.params.id, userId: req.userId, status: { not: 'PROCESSING' } },
    });
    if (deleted.count === 0) {
      const exists = await prisma.email.count({ where: { id: req.params.id, userId: req.userId } });
      throw exists ? new HttpError(409, 'This email is being sent right now') : new HttpError(404, 'Email not found');
    }
    await emailQueue.remove(req.params.id).catch(() => undefined);
    void removeFromIndex(req.params.id);
    res.status(204).end();
  }),
);
