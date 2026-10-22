import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, type AuthedRequest } from '../middleware/auth';
import { scheduleCampaign, scheduleCampaignSchema } from '../services/schedulerService';
import { asyncHandler } from '../utils/asyncHandler';

export const campaignsRouter = Router();
campaignsRouter.use(requireAuth);

campaignsRouter.post(
  '/',
  asyncHandler<AuthedRequest>(async (req, res) => {
    const input = scheduleCampaignSchema.parse(req.body);
    const result = await scheduleCampaign(req.userId, input);
    res.status(201).json({
      campaignId: result.campaign.id,
      scheduled: result.scheduled,
      skippedInvalid: result.skippedInvalid,
      skippedDuplicates: result.skippedDuplicates,
      startAt: result.campaign.startAt.toISOString(),
    });
  }),
);

campaignsRouter.get(
  '/',
  asyncHandler<AuthedRequest>(async (req, res) => {
    const campaigns = await prisma.campaign.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json(campaigns);
  }),
);
