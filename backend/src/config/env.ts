import 'dotenv/config';
import { z } from 'zod';

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v && v.trim().length > 0 ? v.trim() : undefined));

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  BACKEND_URL: z.string().url().default('http://localhost:4000'),
  FRONTEND_URL: z.string().url().default('http://localhost:5173'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default('redis://127.0.0.1:6380'),
  ELASTICSEARCH_URL: z.string().default('http://127.0.0.1:9200'),
  ELASTICSEARCH_INDEX: z.string().default('emails'),

  GOOGLE_CLIENT_ID: optionalString,
  GOOGLE_CLIENT_SECRET: optionalString,
  GOOGLE_REDIRECT_URI: optionalString,

  SLACK_CLIENT_ID: optionalString,
  SLACK_CLIENT_SECRET: optionalString,
  SLACK_REDIRECT_URI: optionalString,

  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(5),
  MIN_SEND_INTERVAL_MS: z.coerce.number().int().nonnegative().default(2000),
  JOB_ATTEMPTS: z.coerce.number().int().positive().default(3),

  MAX_EMAILS_PER_HOUR_PER_SENDER: z.coerce.number().int().positive().default(50),
  MAX_EMAILS_PER_HOUR: z.coerce.number().int().nonnegative().default(0),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(3_600_000),

  ETHEREAL_SENDER_COUNT: z.coerce.number().int().positive().default(3),
  ETHEREAL_SENDERS: optionalString,

  BULL_BOARD_USER: optionalString,
  BULL_BOARD_PASS: optionalString,
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = {
  ...parsed.data,
  GOOGLE_REDIRECT_URI:
    parsed.data.GOOGLE_REDIRECT_URI ?? `${parsed.data.BACKEND_URL}/api/auth/google/callback`,
  SLACK_REDIRECT_URI:
    parsed.data.SLACK_REDIRECT_URI ?? `${parsed.data.BACKEND_URL}/api/slack/callback`,
  isProd: parsed.data.NODE_ENV === 'production',
};
