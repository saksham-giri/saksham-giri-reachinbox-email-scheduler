import { Check, ChevronDown } from 'lucide-react';
import type { Sender } from '../../api/types';
import { usePopover } from '../../hooks/usePopover';
import { cn } from '../../utils/cn';

interface SenderSelectProps {
  id?: string;
  senders: Sender[];
  /** null = rotate across all senders */
  value: string | null;
  onChange: (senderId: string | null) => void;
}

export function SenderSelect({ id, senders, value, onChange }: SenderSelectProps) {
  const popover = usePopover();
  const selected = senders.find((s) => s.id === value);
  const options: { id: string | null; label: string; hint?: string }[] = [
    { id: null, label: 'All senders (rotate)', hint: `${senders.length} Ethereal mailbox${senders.length === 1 ? '' : 'es'}` },
    ...senders.map((s) => ({ id: s.id, label: s.email, hint: s.name })),
  ];

  return (
    <div className="relative" ref={popover.ref}>
      <button
        id={id}
        type="button"
        onClick={popover.toggle}
        aria-haspopup="listbox"
        aria-expanded={popover.open}
        className="flex h-12 max-w-full items-center gap-3 rounded-xl bg-surface px-4 text-[17px] text-gray-900 hover:bg-gray-100"
      >
        <span className="truncate">{selected ? selected.email : senders.length ? 'All senders (rotate)' : 'Loading senders...'}</span>
        <ChevronDown className="h-5 w-5 shrink-0 text-gray-400" />
      </button>
      {popover.open && (
        <ul role="listbox" className="absolute left-0 z-20 mt-2 w-80 rounded-xl border border-gray-100 bg-white p-1 shadow-lg">
          {options.map((o) => (
            <li key={o.id ?? 'all'}>
              <button
                type="button"
                role="option"
                aria-selected={value === o.id}
                onClick={() => {
                  onChange(o.id);
                  popover.close();
                }}
                className={cn('flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left hover:bg-gray-50', value === o.id && 'text-brand-600')}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm">{o.label}</span>
                  {o.hint && <span className="block truncate text-xs text-gray-400">{o.hint}</span>}
                </span>
                {value === o.id && <Check className="h-4 w-4 shrink-0" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
