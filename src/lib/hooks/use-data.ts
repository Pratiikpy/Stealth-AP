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
      const res = await fetch(apiPath);

      if (!res.ok) {
        throw new Error(`API error: ${res.status}`);
      }

      const json = await res.json();
      const result = json.data ?? json;

      // Any successful API response is real data, even if empty
      setData(result as T);
      setIsReal(true);
    } catch (err) {
      // API not available — fall back to mock data
      setData(mockData);
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
