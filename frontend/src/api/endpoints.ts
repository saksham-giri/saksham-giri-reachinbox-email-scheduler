import { apiUrl, request } from './client';
import type {
  AppConfig,
  Email,
  EmailListType,
  EmailStatus,
  EmailStats,
  Paginated,
  ScheduleCampaignInput,
  ScheduleCampaignResponse,
  User,
} from './types';

export const authApi = {
  me: () => request<User>('/auth/me'),
  logout: () => request<void>('/auth/logout', { method: 'POST' }),
  googleLoginUrl: apiUrl('/auth/google'),
};

export const slackApi = {
  connectUrl: apiUrl('/slack/connect'),
  disconnect: () => request<void>('/slack', { method: 'DELETE' }),
  test: () => request<void>('/slack/test', { method: 'POST' }),
};

export interface ListEmailsParams {
  type: EmailListType;
  q?: string;
  status?: EmailStatus;
  page?: number;
  pageSize?: number;
}

export const emailsApi = {
  list: ({ type, q, status, page = 1, pageSize = 20 }: ListEmailsParams) => {
    const params = new URLSearchParams({ type, page: String(page), pageSize: String(pageSize) });
    if (q) params.set('q', q);
    if (status) params.set('status', status);
    return request<Paginated<Email>>(`/emails?${params}`);
  },
  get: (id: string) => request<Email>(`/emails/${id}`),
  setStarred: (id: string, starred: boolean) => request<void>(`/emails/${id}`, { method: 'PATCH', json: { starred } }),
  remove: (id: string) => request<void>(`/emails/${id}`, { method: 'DELETE' }),
  stats: () => request<EmailStats>('/emails/stats'),
};

export const campaignsApi = {
  schedule: (input: ScheduleCampaignInput) =>
    request<ScheduleCampaignResponse>('/campaigns', { method: 'POST', json: input }),
};

export const configApi = {
  get: () => request<AppConfig>('/config'),
};
