"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { get, ApiError } from "./api";

export type Async<T> = {
  data: T | null;
  error: ApiError | Error | null;
  loading: boolean;
  reload: () => void;
};

/**
 * Read hook over React Query, keeping the shape every screen was written
 * against: `{ data, error, loading, reload }`.
 *
 * `loading` is true only while there is nothing to show yet. Background
 * refetches — window focus, a realtime event — keep the current data on
 * screen instead of flashing skeletons under a receptionist mid-task.
 *
 * `deps` become part of the cache key, so a value that changes what the path
 * means (a date, a session) gets its own entry.
 */
export function useApi<T>(path: string | null, deps: unknown[] = [], opts: { refetchInterval?: number } = {}): Async<T> {
  const q = useQuery<T, ApiError | Error>({
    queryKey: ["api", path, ...deps],
    queryFn: () => get<T>(path as string),
    enabled: path !== null,
    refetchInterval: opts.refetchInterval,
  });
  const { refetch } = q;
  const reload = React.useCallback(() => void refetch(), [refetch]);

  return {
    data: q.data ?? null,
    error: q.error ?? null,
    loading: q.isLoading,
    reload,
  };
}

type ActionItem = { id: string; severity: string };

/**
 * Open action-item count for the sidebar badge.
 *
 * This is the number staff check first thing each morning, so it refreshes on
 * an interval rather than only on navigation.
 */
export function useActionCount(): number {
  const q = useApi<ActionItem[]>("/actions", [], { refetchInterval: 60_000 });
  return q.data?.length ?? 0;
}

/**
 * Wraps a mutation with pending state and a typed error, for form buttons.
 *
 * On success every cached read is marked stale and the ones on screen
 * refetch. With this few screens, precise invalidation is not worth the
 * risk of missing one — resolving an action must update the sidebar badge
 * as well as the list it was resolved from.
 */
export function useMutation<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
) {
  const client = useQueryClient();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<ApiError | Error | null>(null);

  const run = React.useCallback(
    async (...args: TArgs): Promise<TResult | null> => {
      setPending(true);
      setError(null);
      try {
        const result = await fn(...args);
        void client.invalidateQueries({ queryKey: ["api"] });
        return result;
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
