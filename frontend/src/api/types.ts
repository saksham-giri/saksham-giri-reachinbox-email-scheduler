export type EmailStatus = 'SCHEDULED' | 'PROCESSING' | 'DELAYED' | 'SENT' | 'FAILED';
export type EmailListType = 'scheduled' | 'sent';

export interface SlackStatus {
  available: boolean;
  connected: boolean;
  teamName: string | null;
  channel: string | null;
}

export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  slack: SlackStatus;
}

export interface Email {
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

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  source: 'postgres' | 'elasticsearch';
}

export interface EmailStats {
  scheduled: number;
  sent: number;
  byStatus: Partial<Record<EmailStatus, number>>;
}

export interface Sender {
  id: string;
  name: string;
  email: string;
}

export interface AppConfig {
  senders: Sender[];
  limits: {
    maxPerHourPerSender: number;
    maxPerHourGlobal: number | null;
    minSendIntervalMs: number;
    windowMs: number;
    workerConcurrency: number;
  };
}

export interface ScheduleCampaignInput {
  subject: string;
  body: string;
  recipients: string[];
  startAt: string;
  delayBetweenSeconds: number;
  hourlyLimit: number | null;
  /** null = rotate across every sender */
  senderId: string | null;
}

export interface ScheduleCampaignResponse {
  campaignId: string;
  scheduled: number;
  skippedInvalid: number;
  skippedDuplicates: number;
  startAt: string;
}
