import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import type { RequestHandler } from 'express';
import { env } from '../config/env';
import { emailQueue } from './emailQueue';

export const BULL_BOARD_PATH = '/admin/queues';

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath(BULL_BOARD_PATH);
createBullBoard({ queues: [new BullMQAdapter(emailQueue)], serverAdapter });

const basicAuth: RequestHandler = (req, res, next) => {
  if (!env.BULL_BOARD_USER || !env.BULL_BOARD_PASS) return next();
  const expected = 'Basic ' + Buffer.from(`${env.BULL_BOARD_USER}:${env.BULL_BOARD_PASS}`).toString('base64');
  if (req.headers.authorization === expected) return next();
  res.set('WWW-Authenticate', 'Basic realm="Bull Board"').status(401).send('Authentication required');
};

export const bullBoardHandlers: RequestHandler[] = [basicAuth, serverAdapter.getRouter()];
