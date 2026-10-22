import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

/** "<- Title ............ actions" bar used by the compose and email detail pages. */
export function PageHeader({ title, actions, backTo = '/dashboard' }: { title: ReactNode; actions?: ReactNode; backTo?: string }) {
  const navigate = useNavigate();
  const goBack = () => (window.history.length > 1 ? navigate(-1) : navigate(backTo));

  return (
    <header className="flex items-center justify-between gap-4 px-4 py-4 md:px-6">
      <div className="flex min-w-0 items-center gap-4">
        <button onClick={goBack} aria-label="Back" className="rounded-full p-1 text-gray-900 hover:bg-gray-100">
          <ArrowLeft className="h-7 w-7" strokeWidth={1.75} />
        </button>
        <h1 className="truncate text-2xl text-gray-900 md:text-[28px]">{title}</h1>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-3">{actions}</div>}
    </header>
  );
}
