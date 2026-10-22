import { Client } from '@elastic/elasticsearch';
import type { EmailStatus } from '@prisma/client';
import { env } from '../config/env';
import { createLogger } from '../lib/logger';
import { prisma } from '../lib/prisma';
import { chunk } from '../utils/chunk';
import { htmlToText } from '../utils/html';
import { emailInclude, toEmailDTO, type EmailDTO, type EmailWithRelations } from './emailDto';

const log = createLogger('search');
const index = env.ELASTICSEARCH_INDEX;

export const es = new Client({ node: env.ELASTICSEARCH_URL });

type EmailDocument = EmailDTO & { userId: string; bodyText: string };

function toDocument(email: EmailWithRelations): EmailDocument {
  return { ...toEmailDTO(email), userId: email.userId, bodyText: htmlToText(email.campaign.body) };
}

export async function removeFromIndex(id: string): Promise<void> {
  await es.delete({ index, id }).catch((err) => log.warn(`failed to remove ${id} from index`, err));
}

export async function ensureSearchIndex(): Promise<void> {
  try {
    if (await es.indices.exists({ index })) return;
    await es.indices.create({
      index,
      mappings: {
        properties: {
          id: { type: 'keyword' },
          userId: { type: 'keyword' },
          campaignId: { type: 'keyword' },
          toEmail: {
            type: 'text',
            analyzer: 'standard',
            fields: { keyword: { type: 'keyword' } },
          },
          subject: { type: 'text' },
          // HTML is stored for display only; search runs on the plain-text copy.
          body: { type: 'text', index: false },
          bodyText: { type: 'text' },
          starred: { type: 'boolean' },
          senderEmail: { type: 'keyword' },
          status: { type: 'keyword' },
          scheduledAt: { type: 'date' },
          sentAt: { type: 'date' },
          createdAt: { type: 'date' },
          attempts: { type: 'integer' },
          deferrals: { type: 'integer' },
          previewUrl: { type: 'keyword', index: false },
          error: { type: 'text' },
        },
      },
    });
    log.info(`created index "${index}"`);
  } catch (err) {
    log.warn('could not ensure Elasticsearch index (search will fall back to Postgres)', err);
  }
}

/**
 * Indexing is a secondary concern: the DB is the source of truth, so failures
 * here are logged and never break scheduling/sending. `npm run es:reindex`
 * rebuilds the index from Postgres if it ever drifts.
 */
export async function indexEmailsById(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  try {
    for (const batch of chunk(ids, 1000)) {
      const emails = await prisma.email.findMany({ where: { id: { in: batch } }, include: emailInclude });
      const operations = emails.flatMap((e) => [{ index: { _index: index, _id: e.id } }, toDocument(e)]);
      const res = await es.bulk({ operations, refresh: false });
      if (res.errors) log.warn('some documents failed to index');
    }
  } catch (err) {
    log.warn(`failed to index ${ids.length} email(s)`, err);
  }
}

export const indexEmail = (id: string) => indexEmailsById([id]);

export interface SearchParams {
  userId: string;
  query: string;
  statuses: EmailStatus[];
  page: number;
  pageSize: number;
}

export async function searchEmails(p: SearchParams): Promise<{ items: EmailDTO[]; total: number }> {
  const res = await es.search<EmailDocument>({
    index,
    from: (p.page - 1) * p.pageSize,
    size: p.pageSize,
    track_total_hits: true,
    query: {
      bool: {
        filter: [{ term: { userId: p.userId } }, { terms: { status: p.statuses } }],
        must: [
          {
            multi_match: {
              query: p.query,
              fields: ['toEmail^3', 'subject^2', 'bodyText'],
              type: 'bool_prefix',
            },
          },
        ],
      },
    },
    sort: ['_score', { scheduledAt: 'desc' }],
  });

  const total = typeof res.hits.total === 'number' ? res.hits.total : (res.hits.total?.value ?? 0);
  const items = res.hits.hits
    .map((h) => h._source)
    .filter((d): d is EmailDocument => Boolean(d))
    .map(({ userId: _userId, bodyText: _bodyText, ...dto }) => dto);
  return { items, total };
}
