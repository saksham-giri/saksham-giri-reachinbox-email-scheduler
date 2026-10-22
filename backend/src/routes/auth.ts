import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import { env } from '../config/env';
import { prisma } from '../lib/prisma';
import { clearSession, requireAuth, setSession, type AuthedRequest } from '../middleware/auth';
import { isSlackConfigured } from '../services/slackService';
import { asyncHandler } from '../utils/asyncHandler';
import { HttpError } from '../utils/httpError';

export const authRouter = Router();

const STATE_COOKIE = 'oauth_state';

interface GoogleProfile {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
}

authRouter.get('/google', (_req, res) => {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw new HttpError(500, 'Google OAuth is not configured (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)');
  }
  const state = randomBytes(16).toString('hex');
  res.cookie(STATE_COOKIE, state, { httpOnly: true, sameSite: 'lax', secure: env.isProd, maxAge: 10 * 60_000 });

  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', env.GOOGLE_CLIENT_ID);
  url.searchParams.set('redirect_uri', env.GOOGLE_REDIRECT_URI);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('state', state);
  url.searchParams.set('prompt', 'select_account');
  res.redirect(url.toString());
});

authRouter.get(
  '/google/callback',
  asyncHandler(async (req, res) => {
    const fail = (reason: string) => res.redirect(`${env.FRONTEND_URL}/login?error=${encodeURIComponent(reason)}`);
    const { code, state, error } = req.query as Record<string, string | undefined>;
    const expectedState = req.cookies?.[STATE_COOKIE];
    res.clearCookie(STATE_COOKIE);

    if (error) return fail(error);
    if (!code || !state || state !== expectedState) return fail('invalid_state');

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID ?? '',
        client_secret: env.GOOGLE_CLIENT_SECRET ?? '',
        redirect_uri: env.GOOGLE_REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    });
    if (!tokenRes.ok) return fail('token_exchange_failed');
    const { access_token } = (await tokenRes.json()) as { access_token: string };

    const profileRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    if (!profileRes.ok) return fail('profile_fetch_failed');
    const profile = (await profileRes.json()) as GoogleProfile;

    const fields = {
      email: profile.email,
      name: profile.name ?? profile.email,
      avatarUrl: profile.picture ?? null,
    };
    const user = await prisma.user.upsert({
      where: { googleId: profile.sub },
      create: { googleId: profile.sub, ...fields },
      update: fields,
    });

    setSession(res, user.id);
    res.redirect(`${env.FRONTEND_URL}/dashboard`);
  }),
);

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler<AuthedRequest>(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.userId }, include: { slack: true } });
    if (!user) {
      clearSession(res);
      return res.status(401).json({ error: 'User not found' });
    }
    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      slack: {
        available: isSlackConfigured(),
        connected: Boolean(user.slack),
        teamName: user.slack?.teamName ?? null,
        channel: user.slack?.channel ?? null,
      },
    });
  }),
);

authRouter.post('/logout', (_req, res) => {
  clearSession(res);
  res.status(204).end();
});
