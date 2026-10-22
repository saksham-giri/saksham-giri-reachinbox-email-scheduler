import { Check, Filter } from 'lucide-react';
import type { EmailListType, EmailStatus } from '../../api/types';
import { usePopover } from '../../hooks/usePopover';
import { cn } from '../../utils/cn';
import { IconButton } from '../ui/Button';

const options: Record<EmailListType, { value: EmailStatus | undefined; label: string }[]> = {
  scheduled: [
    { value: undefined, label: 'All scheduled' },
    { value: 'SCHEDULED', label: 'Waiting' },
    { value: 'DELAYED', label: 'Rate limited' },
    { value: 'PROCESSING', label: 'Sending' },
  ],
  sent: [
    { value: undefined, label: 'All' },
    { value: 'SENT', label: 'Sent' },
    { value: 'FAILED', label: 'Failed' },
  ],
};

interface FilterMenuProps {
  type: EmailListType;
  value: EmailStatus | undefined;
  onChange: (value: EmailStatus | undefined) => void;
}

export function FilterMenu({ type, value, onChange }: FilterMenuProps) {
  const popover = usePopover();
  return (
    <div className="relative" ref={popover.ref}>
      <IconButton label="Filter by status" active={Boolean(value)} onClick={popover.toggle} className="h-10 w-10">
        <Filter className="h-5 w-5" />
      </IconButton>
      {popover.open && (
        <div role="menu" className="absolute right-0 z-20 mt-2 w-48 rounded-xl border border-gray-100 bg-white p-1 shadow-lg">
          {options[type].map((o) => (
            <button
              key={o.label}
              role="menuitemradio"
              aria-checked={value === o.value}
              onClick={() => {
                onChange(o.value);
                popover.close();
              }}
              className={cn('flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-gray-50', value === o.value && 'text-brand-600')}
            >
              {o.label}
              {value === o.value && <Check className="h-4 w-4" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
