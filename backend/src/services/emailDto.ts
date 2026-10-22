import type { Campaign, Email, EmailStatus, Sender } from '@prisma/client';

export const SCHEDULED_STATUSES: EmailStatus[] = ['SCHEDULED', 'PROCESSING', 'DELAYED'];
export const SENT_STATUSES: EmailStatus[] = ['SENT', 'FAILED'];

export type EmailWithRelations = Email & {
  campaign: Pick<Campaign, 'subject' | 'body'>;
  sender: Pick<Sender, 'email' | 'name'>;
};

export const emailInclude = {
  campaign: { select: { subject: true, body: true } },
  sender: { select: { email: true, name: true } },
} as const;

export interface EmailDTO {
  id: string;
  campaignId: string;
  toEmail: string;
  subject: string;
  body: string;
  senderEmail: string;
  senderName: string;
  status: EmailStatus;
  scheduledAt: string;
  sentAt: string | null;
  attempts: number;
  deferrals: number;
  starred: boolean;
  previewUrl: string | null;
  error: string | null;
  createdAt: string;
}

export function toEmailDTO(e: EmailWithRelations): EmailDTO {
  return {
    id: e.id,
    campaignId: e.campaignId,
    toEmail: e.toEmail,
    subject: e.campaign.subject,
    body: e.campaign.body,
    senderEmail: e.sender.email,
    senderName: e.sender.name,
    status: e.status,
    scheduledAt: e.scheduledAt.toISOString(),
    sentAt: e.sentAt?.toISOString() ?? null,
    attempts: e.attempts,
    deferrals: e.deferrals,
    starred: e.starred,
    previewUrl: e.previewUrl,
    error: e.error,
    createdAt: e.createdAt.toISOString(),
  };
}
