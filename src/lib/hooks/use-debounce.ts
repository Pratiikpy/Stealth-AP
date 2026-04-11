import { useState, useEffect } from "react";

/**
 * Debounce a value — only updates after user stops changing it.
 *
 * Stripe lesson: showing "invalid email" while user is still typing
 * destroyed the checkout experience. Delay validation until pause.
 */
export function useDebounce<T>(value: T, delayMs: number = 500): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
