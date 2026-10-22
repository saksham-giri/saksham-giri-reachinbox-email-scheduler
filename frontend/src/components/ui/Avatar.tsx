import { useState } from 'react';
import { cn } from '../../utils/cn';
import { initials } from '../../utils/format';

interface AvatarProps {
  name: string;
  src?: string | null;
  /** soft = pale green initials, solid = white initials on brand green */
  tone?: 'soft' | 'solid';
  className?: string;
}

export function Avatar({ name, src, tone = 'soft', className }: AvatarProps) {
  const [failed, setFailed] = useState(false);
  const base = cn('h-9 w-9 shrink-0 rounded-full', className);
  if (src && !failed) {
    // Google avatars refuse hot-linking when a Referer header is sent.
    return <img src={src} alt={name} referrerPolicy="no-referrer" onError={() => setFailed(true)} className={cn(base, 'object-cover')} />;
  }
  return (
    <span
      className={cn(
        base,
        'flex items-center justify-center font-semibold',
        tone === 'solid' ? 'bg-brand-500 text-white' : 'bg-brand-100 text-brand-700',
      )}
    >
      {initials(name)}
    </span>
  );
}
