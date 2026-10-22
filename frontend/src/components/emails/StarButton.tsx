import { Star } from 'lucide-react';
import { useState, type MouseEvent } from 'react';
import toast from 'react-hot-toast';
import { emailsApi } from '../../api/endpoints';
import { cn } from '../../utils/cn';

/** Optimistic star toggle; reverts and toasts if the request fails. */
export function StarButton({ id, starred, className }: { id: string; starred: boolean; className?: string }) {
  const [value, setValue] = useState(starred);
  const [prop, setProp] = useState(starred);
  // Follow server updates (polling) unless the user just changed it.
  if (prop !== starred) {
    setProp(starred);
    setValue(starred);
  }

  async function toggle(e: MouseEvent) {
    // The star sits inside the row link: don't navigate.
    e.preventDefault();
    e.stopPropagation();
    const next = !value;
    setValue(next);
    try {
      await emailsApi.setStarred(id, next);
    } catch {
      setValue(!next);
      toast.error('Could not update star');
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={value ? 'Unstar' : 'Star'}
      aria-pressed={value}
      className={cn('rounded-full p-1.5 transition-colors hover:bg-gray-100', className)}
    >
      <Star className={cn('h-5 w-5', value ? 'fill-amber-400 text-amber-400' : 'text-gray-300')} />
    </button>
  );
}
