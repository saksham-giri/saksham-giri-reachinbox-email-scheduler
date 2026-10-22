import { useState } from 'react';
import { cn } from '../../utils/cn';
import { formatRelativeDay, toLocalInputValue } from '../../utils/format';
import { Button } from '../ui/Button';

function tomorrowAt(hours?: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  if (hours !== undefined) d.setHours(hours, 0, 0, 0);
  else d.setSeconds(0, 0);
  return d;
}

const presets = [
  { label: 'Tomorrow', at: () => tomorrowAt() },
  { label: 'Tomorrow, 10:00 AM', at: () => tomorrowAt(10) },
  { label: 'Tomorrow, 11:00 AM', at: () => tomorrowAt(11) },
  { label: 'Tomorrow, 3:00 PM', at: () => tomorrowAt(15) },
];

interface SendLaterPopoverProps {
  value: Date | null;
  onDone: (date: Date | null) => void;
  onCancel: () => void;
}

export function SendLaterPopover({ value, onDone, onCancel }: SendLaterPopoverProps) {
  const [draft, setDraft] = useState(value ? toLocalInputValue(value) : '');
  const [error, setError] = useState<string | null>(null);
  const draftDate = draft ? new Date(draft) : null;

  function done() {
    if (draftDate && draftDate.getTime() < Date.now() - 60_000) {
      setError('Pick a time in the future');
      return;
    }
    onDone(draftDate);
  }

  return (
    <div role="dialog" aria-label="Send later" className="absolute right-0 top-full z-30 mt-3 w-[340px] rounded-xl border border-gray-100 bg-white p-6 shadow-xl">
      <h2 className="mb-5 text-xl text-gray-900">Send Later</h2>
      <label className="mb-1 block text-xs text-gray-500" htmlFor="send-later-at">
        Pick date &amp; time
      </label>
      <input
        id="send-later-at"
        type="datetime-local"
        value={draft}
        min={toLocalInputValue(new Date())}
        onChange={(e) => {
          setDraft(e.target.value);
          setError(null);
        }}
        className="w-full border-b border-gray-200 pb-2 text-[15px] text-gray-900 focus:border-brand-500 focus:outline-none"
      />
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}

      <ul className="mt-4 flex flex-col">
        {presets.map((p) => {
          const at = p.at();
          const selected = draftDate?.getTime() === at.getTime();
          return (
            <li key={p.label}>
              <button
                type="button"
                onClick={() => {
                  setDraft(toLocalInputValue(at));
                  setError(null);
                }}
                className={cn('w-full rounded-lg px-1 py-2.5 text-left text-[17px] text-gray-800 hover:text-brand-600', selected && 'font-medium text-brand-600')}
              >
                {p.label}
              </button>
            </li>
          );
        })}
      </ul>

      {draftDate && <p className="mt-3 text-sm text-gray-500">Starts {formatRelativeDay(draftDate)}</p>}

      <div className="mt-8 flex items-center justify-end gap-4">
        {value && (
          <button type="button" onClick={() => onDone(null)} className="mr-auto text-sm text-gray-500 hover:text-gray-700">
            Send now instead
          </button>
        )}
        <button type="button" onClick={onCancel} className="px-3 text-[17px] text-gray-900 hover:text-gray-600">
          Cancel
        </button>
        <Button variant="outline" onClick={done} className="h-11 px-8 text-[17px] font-normal">
          Done
        </Button>
      </div>
    </div>
  );
}
