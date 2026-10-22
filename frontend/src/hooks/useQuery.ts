import { useCallback, useEffect, useRef, useState } from 'react';

interface QueryState<T> {
  data: T | undefined;
  error: Error | null;
  /** True only for the first load (or when the key changes), not background refreshes */
  loading: boolean;
  refetch: () => Promise<void>;
}

/**
 * Minimal data-fetching hook: refetches when `deps` change and optionally
 * polls in the background so scheduled/sent lists update live.
 */
export function useQuery<T>(fetcher: () => Promise<T>, deps: unknown[], pollMs?: number): QueryState<T> {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const requestId = useRef(0);

  const run = useCallback(async (background: boolean) => {
    const id = ++requestId.current;
    if (!background) setLoading(true);
    try {
      const result = await fetcherRef.current();
      if (id === requestId.current) {
        setData(result);
        setError(null);
      }
    } catch (err) {
      if (id === requestId.current) setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void run(false);
    if (!pollMs) return;
    const timer = setInterval(() => void run(true), pollMs);
    return () => clearInterval(timer);
  }, [...deps, pollMs]);

  const refetch = useCallback(() => run(true), [run]);
  return { data, error, loading, refetch };
}
