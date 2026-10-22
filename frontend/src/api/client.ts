export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  json?: unknown;
}

export async function request<T>(path: string, { json, headers, ...init }: RequestOptions = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: 'include',
    ...init,
    headers: json !== undefined ? { 'Content-Type': 'application/json', ...headers } : headers,
    body: json !== undefined ? JSON.stringify(json) : undefined,
  });

  if (!res.ok) {
    let message = res.statusText || 'Request failed';
    try {
      const data = (await res.json()) as { error?: string };
      if (data.error) message = data.error;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Full-page navigations (OAuth flows) go through the same proxy prefix. */
export const apiUrl = (path: string) => `/api${path}`;
