import { Clock, Send } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { EmailListType, EmailStats } from '../../api/types';
import { cn } from '../../utils/cn';
import { Button } from '../ui/Button';
import { UserMenu } from './UserMenu';

export function Logo() {
  return <span className="font-logo text-[44px] font-bold leading-none tracking-tight text-gray-900">ONB</span>;
}

const navItems: { key: EmailListType; label: string; icon: ReactNode }[] = [
  { key: 'scheduled', label: 'Scheduled', icon: <Clock className="h-5 w-5" /> },
  { key: 'sent', label: 'Sent', icon: <Send className="h-5 w-5" /> },
];

export function Sidebar({ stats }: { stats: EmailStats | undefined }) {
  const [params] = useSearchParams();
  const active: EmailListType = params.get('tab') === 'sent' ? 'sent' : 'scheduled';

  return (
    <aside className="flex w-full shrink-0 flex-col gap-4 px-4 pb-4 pt-6 md:w-[280px] md:px-5">
      <Link to="/dashboard" className="px-2">
        <Logo />
      </Link>
      <UserMenu />
      <Link to="/compose">
        <Button variant="outline" size="lg" className="w-full text-[17px] font-normal">
          Compose
        </Button>
      </Link>

      <p className="mt-4 px-4 text-[13px] uppercase text-gray-400">Core</p>
      <nav className="-mt-2 flex flex-col gap-1">
        {navItems.map((item) => (
          <Link
            key={item.key}
            to={`/dashboard?tab=${item.key}`}
            aria-current={active === item.key ? 'page' : undefined}
            className={cn(
              'flex items-center gap-3 rounded-xl px-4 py-3 text-[17px] transition-colors',
              active === item.key ? 'bg-brand-50 font-semibold text-gray-900' : 'text-gray-700 hover:bg-gray-50',
            )}
          >
            <span className="text-gray-700">{item.icon}</span>
            <span className="flex-1">{item.label}</span>
            <span className="text-sm font-normal text-gray-500">{stats?.[item.key] ?? ''}</span>
          </Link>
        ))}
      </nav>
    </aside>
  );
}
