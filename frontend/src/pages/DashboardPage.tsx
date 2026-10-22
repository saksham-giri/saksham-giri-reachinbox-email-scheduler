import { AlertCircle, RefreshCw, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useSearchParams } from 'react-router-dom';
import { emailsApi } from '../api/endpoints';
import type { EmailListType, EmailStatus } from '../api/types';
import { EmailList } from '../components/emails/EmailList';
import { FilterMenu } from '../components/emails/FilterMenu';
import { useLayout } from '../components/layout/AppLayout';
import { Button, IconButton } from '../components/ui/Button';
import { Pagination } from '../components/ui/Pagination';
import { useAuth } from '../context/AuthContext';
import { useDebounce } from '../hooks/useDebounce';
import { useQuery } from '../hooks/useQuery';
import { cn } from '../utils/cn';

const PAGE_SIZE = 20;
const POLL_MS = 5000;

const slackMessages: Record<string, () => void> = {
  connected: () => toast.success('Slack connected! A confirmation message was posted to your channel.'),
  cancelled: () => toast('Slack connection was cancelled.'),
  error: () => toast.error('Could not connect Slack. Please try again.'),
};

export function DashboardPage() {
  const [params, setParams] = useSearchParams();
  const type: EmailListType = params.get('tab') === 'sent' ? 'sent' : 'scheduled';
  const { refreshStats } = useLayout();
  const { refresh: refreshUser } = useAuth();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<EmailStatus>();
  const [refreshing, setRefreshing] = useState(false);
  const q = useDebounce(search.trim(), 300);

  // Switching tabs resets paging and the status filter (filters are per tab).
  const [prevType, setPrevType] = useState(type);
  if (prevType !== type) {
    setPrevType(type);
    setPage(1);
    setStatus(undefined);
  }

  const { data, loading, error, refetch } = useQuery(
    () => emailsApi.list({ type, q: q || undefined, status, page, pageSize: PAGE_SIZE }),
    [type, q, status, page],
    POLL_MS,
  );

  // Result of the Slack OAuth round-trip comes back as ?slack=...
  useEffect(() => {
    const slack = params.get('slack');
    if (!slack) return;
    slackMessages[slack]?.();
    void refreshUser();
    params.delete('slack');
    setParams(params, { replace: true });
  }, [params, setParams, refreshUser]);

  async function refresh() {
    setRefreshing(true);
    await Promise.all([refetch(), refreshStats()]);
    setRefreshing(false);
  }

  return (
    <div>
      <div className="flex items-center gap-3 md:gap-5">
        <div className="relative flex-1 md:max-w-[910px]">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search"
            aria-label="Search emails"
            className="h-12 w-full rounded-full bg-surface pl-12 pr-5 text-[17px] placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
          />
        </div>
        <FilterMenu
          type={type}
          value={status}
          onChange={(s) => {
            setStatus(s);
            setPage(1);
          }}
        />
        <IconButton label="Refresh" onClick={refresh} className="h-10 w-10">
          <RefreshCw className={cn('h-5 w-5', refreshing && 'animate-spin')} />
        </IconButton>
        {data?.source === 'elasticsearch' && <span className="hidden text-xs text-gray-400 xl:inline">via Elasticsearch</span>}
      </div>

      <div className="mt-4">
        {error && !data ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center text-sm text-gray-600">
            <AlertCircle className="h-6 w-6 text-red-500" />
            <p>Could not load emails: {error.message}</p>
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              Try again
            </Button>
          </div>
        ) : (
          <EmailList type={type} emails={data?.items} loading={loading} filtered={Boolean(q || status)} />
        )}
        {data && <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onChange={setPage} />}
      </div>
    </div>
  );
}
