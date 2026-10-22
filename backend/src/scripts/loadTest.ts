import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';
import { emailQueue } from '../queue/emailQueue';
import { scheduleCampaign } from '../services/schedulerService';

/**
 * Schedules N emails (default 1000) for roughly the same moment, owned by the
 * first user in the DB, to watch limiter spacing and hourly-limit deferrals in
 * Bull Board. Usage: npm run load-test -- 1000 100
 */
async function main() {
  const count = Number(process.argv[2] ?? 1000);
  const hourlyLimit = Number(process.argv[3] ?? 100);
  const user = await prisma.user.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!user) throw new Error('Log in once through the UI first so a user exists');

  const recipients = Array.from({ length: count }, (_, i) => `lead${i + 1}@example.com`);
  const started = Date.now();
  const result = await scheduleCampaign(user.id, {
    subject: `Load test ${new Date().toISOString()}`,
    body: 'Hello from the load test.',
    recipients,
    startAt: new Date(Date.now() + 10_000),
    delayBetweenSeconds: 0,
    hourlyLimit,
  });
  console.log(`scheduled ${result.scheduled} emails in ${Date.now() - started}ms (campaign ${result.campaign.id})`);
  await Promise.all([emailQueue.close(), prisma.$disconnect(), redis.quit()]);
  // The queue's own ioredis connection is not closed by queue.close().
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
