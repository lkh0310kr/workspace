import { useCallback, useState } from "react";

type CacheEntry<T> = { savedAt: number; value: T };

/** Keep the last successful dashboard response across app restarts. */
export function useDashboardCache<T>(key: string): [T | null, (value: T) => void] {
  const [value, setValue] = useState<T | null>(() => {
    try {
      const raw = localStorage.getItem(`workspace.dashboard.${key}`);
      if (!raw) return null;
      const entry = JSON.parse(raw) as CacheEntry<T>;
      return entry?.value ?? null;
    } catch {
      return null;
    }
  });

  const save = useCallback((next: T) => {
    setValue(next);
    try {
      localStorage.setItem(
        `workspace.dashboard.${key}`,
        JSON.stringify({ savedAt: Date.now(), value: next } satisfies CacheEntry<T>),
      );
    } catch {
      // Storage may be unavailable or full; live dashboard data still works.
    }
  }, [key]);

  return [value, save];
}

