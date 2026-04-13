import { useCallback, useEffect, useState } from "react";

export interface RecentItem {
  id: string;
  label: string;
  hint?: string;
  path: string;
}

const MAX_RECENTS = 5;
const STORAGE_KEY = "nvoke:recent-searches";

function read(): RecentItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x): x is RecentItem =>
        x &&
        typeof x.id === "string" &&
        typeof x.label === "string" &&
        typeof x.path === "string",
    );
  } catch {
    return [];
  }
}

function write(items: RecentItem[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    /* quota or disabled — ignore */
  }
}

export function useRecentSearches() {
  const [recents, setRecents] = useState<RecentItem[]>([]);

  useEffect(() => {
    setRecents(read());
  }, []);

  const pushRecent = useCallback((item: RecentItem) => {
    setRecents((prev) => {
      const deduped = prev.filter((p) => p.id !== item.id);
      const next = [item, ...deduped].slice(0, MAX_RECENTS);
      write(next);
      return next;
    });
  }, []);

  const clearRecents = useCallback(() => {
    write([]);
    setRecents([]);
  }, []);

  return { recents, pushRecent, clearRecents };
}
