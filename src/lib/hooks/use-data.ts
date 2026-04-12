"use client";

import { useState, useEffect, useCallback } from "react";

/**
 * Generic data fetching hook.
 * Tries to fetch from API, falls back to mock data if Supabase
 * isn't configured or returns an error.
 *
 * This lets the app work in:
 * - Demo mode (no Supabase) — shows mock data
 * - Production mode (Supabase connected) — shows real data
 */
export function useData<T>(
  apiPath: string,
  mockData: T,
  options?: { enabled?: boolean }
): {
  data: T;
  loading: boolean;
  error: string | null;
  refresh: () => void;
  isReal: boolean;
} {
  const [data, setData] = useState<T>(mockData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isReal, setIsReal] = useState(false);
  const enabled = options?.enabled !== false;

  const fetchData = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // cache: "no-store" prevents the browser from serving a stale
      // response after we mutate server-side state (e.g. after saving a
      // vendor address, we refetch invoices — without this, the refetch
      // could hit the browser cache and return the pre-save join).
      const res = await fetch(apiPath, { cache: "no-store" });

      if (!res.ok) {
        throw new Error(`API error: ${res.status}`);
      }

      const json = await res.json();
      const result = json.data ?? json;

      // Any successful API response is real data, even if empty
      setData(result as T);
      setIsReal(true);
    } catch (err) {
      // Error path — do NOT clobber the current data with the caller's
      // initialValue. Previously this line reset to `mockData`, which
      // caused fake invoices / vendors to flash onto dashboard cards any
      // time the API hiccuped. Pages should pass an empty-shape initial
      // value (e.g. `[]`) so the worst case is an empty state, not
      // fictional content pretending to be the user's data.
      setIsReal(false);
      setError(err instanceof Error ? err.message : "Failed to fetch data");
    } finally {
      setLoading(false);
    }
  }, [apiPath, enabled, mockData]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refresh: fetchData, isReal };
}
