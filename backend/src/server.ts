import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import { env } from './config/env';
import { createLogger } from './lib/logger';
import { prisma } from './lib/prisma';
import { redis } from './lib/redis';
import { errorHandler } from './middleware/errorHandler';
import { BULL_BOARD_PATH, bullBoardHandlers } from './queue/bullBoard';
import { emailQueue } from './queue/emailQueue';
import { authRouter } from './routes/auth';
import { campaignsRouter } from './routes/campaigns';
import { emailsRouter } from './routes/emails';
import { metaRouter } from './routes/meta';
import { slackRouter } from './routes/slack';
import { ensureSearchIndex } from './services/searchService';
import { ensureSenders } from './services/senderService';

const log = createLogger('api');

async function main() {
  await ensureSenders();
  await ensureSearchIndex();

  const app = express();
  app.set('trust proxy', 1);
  app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));
  app.use(express.json({ limit: '5mb' }));
  app.use(cookieParser());

  app.use('/api', metaRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/slack', slackRouter);
  app.use('/api/campaigns', campaignsRouter);
  app.use('/api/emails', emailsRouter);
  app.use(BULL_BOARD_PATH, ...bullBoardHandlers);
  app.use(errorHandler);

  const server = app.listen(env.PORT, () => {
    log.info(`API on ${env.BACKEND_URL} | Bull Board on ${env.BACKEND_URL}${BULL_BOARD_PATH}`);
  });

  const shutdown = () => {
    server.close(async () => {
      await emailQueue.close();
      await Promise.all([prisma.$disconnect(), redis.quit()]);
      process.exit(0);
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  log.error('API failed to start', err);
  process.exit(1);
});
