"use client";

import { useState, useEffect, useCallback, useRef } from "react";

/**
 * Generic data-fetching hook.
 *
 * Behavior:
 *  - On mount, fetches from `apiPath`.
 *  - On success (including an empty array): stores the data, marks `isReal`.
 *  - On failure: leaves `data` as-is (initial or previously-successful),
 *    sets `error`, marks `isReal=false`. Never clobbers real data with the
 *    caller's `initialValue` — that path previously flashed mock fixtures
 *    into users' dashboards whenever the API hiccuped.
 *
 * Critical: `initialValue` is NOT tracked in the fetch callback's deps.
 * Callers pass freshly-constructed values like `[]` every render, and
 * including those in deps caused an infinite fetch loop (new ref → new
 * callback → new effect → new fetch → new render → repeat, presenting
 * as a blinking UI). We snapshot the initial value in a ref so it stays
 * stable for the lifetime of the component.
 */
export function useData<T>(
  apiPath: string,
  initialValue: T,
  options?: { enabled?: boolean },
): {
  data: T;
  loading: boolean;
  error: string | null;
  refresh: () => void;
  isReal: boolean;
} {
  // Freeze the initial value on first render so component re-renders that
  // pass `[]` every time don't retrigger the fetch callback.
  const initialRef = useRef(initialValue);
  const [data, setData] = useState<T>(initialRef.current);
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
      // cache: "no-store" — we mutate server state (pay, PATCH vendor, etc.)
      // and must see fresh reads after any mutation. Browser cache would
      // serve a stale join and cause "why is my saved address gone" bugs.
      const res = await fetch(apiPath, { cache: "no-store" });
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const json = await res.json();
      const result = json.data ?? json;
      setData(result as T);
      setIsReal(true);
    } catch (err) {
      // Keep whatever data we had (initial or last success). Set the error
      // so the UI can surface it; don't lie with reset-to-initial.
      setIsReal(false);
      setError(err instanceof Error ? err.message : "Failed to fetch data");
    } finally {
      setLoading(false);
    }
  }, [apiPath, enabled]); // <-- initialValue intentionally omitted

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refresh: fetchData, isReal };
}
