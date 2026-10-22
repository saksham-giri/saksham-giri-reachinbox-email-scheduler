import { Outlet, useOutletContext } from 'react-router-dom';
import { emailsApi } from '../../api/endpoints';
import type { EmailStats } from '../../api/types';
import { useQuery } from '../../hooks/useQuery';
import { Sidebar } from './Sidebar';

interface LayoutContext {
  stats: EmailStats | undefined;
  refreshStats: () => Promise<void>;
}

const POLL_MS = 5000;

/** Sidebar layout used by the inbox views; compose and detail pages are full-width. */
export function AppLayout() {
  const { data: stats, refetch } = useQuery(emailsApi.stats, [], POLL_MS);

  return (
    <div className="flex min-h-screen flex-col md:h-screen md:flex-row md:overflow-hidden">
      <Sidebar stats={stats} />
      <main className="min-w-0 flex-1 overflow-y-auto px-4 pb-6 pt-6 md:pr-6">
        <Outlet context={{ stats, refreshStats: refetch } satisfies LayoutContext} />
      </main>
    </div>
  );
}

export const useLayout = () => useOutletContext<LayoutContext>();
