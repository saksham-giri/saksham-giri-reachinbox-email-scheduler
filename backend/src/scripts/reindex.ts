import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';
import { ensureSearchIndex, indexEmailsById } from '../services/searchService';

// Rebuilds the Elasticsearch index from Postgres (the source of truth).
async function main() {
  await ensureSearchIndex();
  const ids = (await prisma.email.findMany({ select: { id: true } })).map((e) => e.id);
  await indexEmailsById(ids);
  console.log(`reindexed ${ids.length} email(s)`);
  await Promise.all([prisma.$disconnect(), redis.quit()]);
}

void main();
