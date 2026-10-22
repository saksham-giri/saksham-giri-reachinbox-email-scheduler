import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { createLogger } from '../lib/logger';
import { HttpError } from '../utils/httpError';

const log = createLogger('http');

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    const first = err.issues[0];
    return res.status(400).json({ error: first ? `${first.path.join('.') || 'input'}: ${first.message}` : 'Invalid input' });
  }
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  log.error('unhandled error', err);
  res.status(500).json({ error: 'Internal server error' });
};
