import { Clock, Hourglass, Loader2 } from 'lucide-react';
import type { Email } from '../../api/types';
import { cn } from '../../utils/cn';
import { formatChipTime } from '../../utils/format';

const chip = 'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-0.5 text-[15px]';

/** Orange time chip for pending emails, grey "Sent" / red "Failed" for finished ones. */
export function StatusChip({ email }: { email: Pick<Email, 'status' | 'scheduledAt'> }) {
  switch (email.status) {
    case 'SCHEDULED':
      return (
        <span className={cn(chip, 'border-orange-200 bg-orange-50 text-orange-700')}>
          <Clock className="h-4 w-4" /> {formatChipTime(email.scheduledAt)}
        </span>
      );
    case 'DELAYED':
      return (
        <span className={cn(chip, 'border-amber-300 bg-amber-50 text-amber-800')} title="Hourly limit reached, moved to the next available window">
          <Hourglass className="h-4 w-4" /> {formatChipTime(email.scheduledAt)}
        </span>
      );
    case 'PROCESSING':
      return (
        <span className={cn(chip, 'border-blue-200 bg-blue-50 text-blue-700')}>
          <Loader2 className="h-4 w-4 animate-spin" /> Sending
        </span>
      );
    case 'SENT':
      return <span className={cn(chip, 'border-gray-200 bg-gray-100 text-gray-700')}>Sent</span>;
    case 'FAILED':
      return <span className={cn(chip, 'border-red-200 bg-red-50 text-red-700')}>Failed</span>;
  }
}
