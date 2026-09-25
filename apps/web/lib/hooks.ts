"use client";

import * as React from "react";
import { get, ApiError } from "./api";

export type Async<T> = {
  data: T | null;
  error: ApiError | Error | null;
  loading: boolean;
  reload: () => void;
};

/**
 * Minimal data hook. No react-query yet — this app has a handful of screens and
 * the dependency is not earning its keep. Swap it in when caching, background
 * refetch or optimistic updates actually become the problem.
 */
export function useApi<T>(path: string | null, deps: unknown[] = []): Async<T> {
  const [data, setData] = React.useState<T | null>(null);
  const [error, setError] = React.useState<ApiError | Error | null>(null);
  const [loading, setLoading] = React.useState(path !== null);
  const [nonce, setNonce] = React.useState(0);

  React.useEffect(() => {
    if (path === null) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);

    get<T>(path)
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(e instanceof Error ? e : new Error(String(e))))
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, nonce, ...deps]);

  return { data, error, loading, reload: () => setNonce((n) => n + 1) };
}

type ActionItem = { id: string; severity: string };

/**
 * Open action-item count for the sidebar badge.
 *
 * This is the number staff check first thing each morning, so it refreshes on
 * an interval rather than only on navigation.
 */
export function useActionCount(): number {
  const [count, setCount] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    const load = () =>
      get<ActionItem[]>("/actions")
        .then((rows) => !cancelled && setCount(rows.length))
        .catch(() => undefined);

    load();
    const id = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return count;
}

/** Wraps a mutation with pending state and a typed error, for form buttons. */
export function useMutation<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
) {
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<ApiError | Error | null>(null);

  const run = React.useCallback(
    async (...args: TArgs): Promise<TResult | null> => {
      setPending(true);
      setError(null);
      try {
        return await fn(...args);
      } catch (e) {
        setError(e instanceof Error ? e : new Error(String(e)));
        return null;
      } finally {
        setPending(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return { run, pending, error, clearError: () => setError(null) };
}
