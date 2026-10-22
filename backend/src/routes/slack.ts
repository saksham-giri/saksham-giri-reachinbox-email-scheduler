import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { createLogger } from '../lib/logger';
import { requireAuth, type AuthedRequest } from '../middleware/auth';
import {
  completeSlackOAuth,
  disconnectSlack,
  isSlackConfigured,
  sendSlackTest,
  slackAuthorizeUrl,
} from '../services/slackService';
import { asyncHandler } from '../utils/asyncHandler';
import { HttpError } from '../utils/httpError';

const log = createLogger('slack');
export const slackRouter = Router();

const backToDashboard = (status: string) => `${env.FRONTEND_URL}/dashboard?slack=${status}`;

// Browser navigates here from the "Connect Slack" button. The user id travels
// in a short-lived signed `state`, so the callback does not depend on cookies
// (the callback usually arrives through an HTTPS tunnel on another host).
slackRouter.get('/connect', requireAuth, (req, res) => {
  if (!isSlackConfigured()) throw new HttpError(500, 'Slack OAuth is not configured');
  const state = jwt.sign({ sub: (req as AuthedRequest).userId, purpose: 'slack' }, env.JWT_SECRET, { expiresIn: '10m' });
  res.redirect(slackAuthorizeUrl(state));
});

slackRouter.get(
  '/callback',
  asyncHandler(async (req, res) => {
    const { code, state, error } = req.query as Record<string, string | undefined>;
    if (error || !code || !state) return res.redirect(backToDashboard(error === 'access_denied' ? 'cancelled' : 'error'));
    try {
      const payload = jwt.verify(state, env.JWT_SECRET) as jwt.JwtPayload;
      if (payload.purpose !== 'slack' || !payload.sub) throw new Error('bad state');
      await completeSlackOAuth(String(payload.sub), code);
      res.redirect(backToDashboard('connected'));
    } catch (err) {
      log.warn('Slack OAuth callback failed', err);
      res.redirect(backToDashboard('error'));
    }
  }),
);

slackRouter.post(
  '/test',
  requireAuth,
  asyncHandler<AuthedRequest>(async (req, res) => {
    await sendSlackTest(req.userId);
    res.status(204).end();
  }),
);

slackRouter.delete(
  '/',
  requireAuth,
  asyncHandler<AuthedRequest>(async (req, res) => {
    await disconnectSlack(req.userId);
    res.status(204).end();
  }),
);
