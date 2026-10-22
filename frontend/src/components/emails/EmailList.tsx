import { CalendarClock, Inbox, SearchX } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Email, EmailListType } from '../../api/types';
import { cn } from '../../utils/cn';
import { formatShortDateTime, htmlPreview } from '../../utils/format';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';
import { StarButton } from './StarButton';
import { StatusChip } from './StatusChip';

function EmailRow({ email, type }: { email: Email; type: EmailListType }) {
  return (
    <li>
      <Link
        to={`/emails/${email.id}`}
        className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-gray-100 px-4 py-5 transition-colors hover:bg-gray-50 md:flex-nowrap md:px-8"
      >
        <span className="w-full truncate text-[17px] text-gray-900 md:w-44 md:shrink-0 lg:w-64">To: {email.toEmail}</span>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <StatusChip email={email} />
          <p className="min-w-0 truncate text-[17px]">
            <span className="text-gray-900">{email.subject}</span>
            <span className="text-gray-400"> - {htmlPreview(email.body)}</span>
          </p>
        </div>
        {type === 'sent' && (
          <span className="hidden shrink-0 text-sm text-gray-500 lg:inline" title="Sent time">
            {formatShortDateTime(email.sentAt)}
          </span>
        )}
        <StarButton id={email.id} starred={email.starred} />
      </Link>
    </li>
  );
}

function SkeletonRows() {
  return (
    <ul aria-label="Loading emails" className="animate-pulse">
      {Array.from({ length: 6 }, (_, i) => (
        <li key={i} className="flex items-center gap-4 border-b border-gray-100 px-4 py-6 md:px-8">
          <span className="h-4 w-40 rounded bg-gray-100" />
          <span className="h-6 w-28 rounded-full bg-gray-100" />
          <span className="h-4 flex-1 rounded bg-gray-100" />
        </li>
      ))}
    </ul>
  );
}

interface EmailListProps {
  type: EmailListType;
  emails: Email[] | undefined;
  loading: boolean;
  filtered: boolean;
}

export function EmailList({ type, emails, loading, filtered }: EmailListProps) {
  if (loading && !emails) return <SkeletonRows />;

  if (!emails || emails.length === 0) {
    let empty: ReactNode;
    if (filtered) {
      empty = <EmptyState icon={<SearchX className="h-6 w-6" />} title="No matching emails" description="Try a different search or filter." />;
    } else if (type === 'scheduled') {
      empty = (
        <EmptyState
          icon={<CalendarClock className="h-6 w-6" />}
          title="No scheduled emails"
          description="Emails you schedule will show up here until they are sent."
          action={
            <Link to="/compose">
              <Button variant="outline" size="sm">
                Compose new email
              </Button>
            </Link>
          }
        />
      );
    } else {
      empty = <EmptyState icon={<Inbox className="h-6 w-6" />} title="No sent emails yet" description="Delivered and failed emails will appear here." />;
    }
    return <>{empty}</>;
  }

  return (
    <ul className={cn(loading && 'opacity-60 transition-opacity')}>
      {emails.map((e) => (
        <EmailRow key={e.id} email={e} type={type} />
      ))}
    </ul>
  );
}
