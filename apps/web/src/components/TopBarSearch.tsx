import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { useApi } from "../lib/api";
import { useRecentSearches, type RecentItem } from "../lib/useRecentSearches";
import { SUGGESTED_ITEMS } from "../lib/searchSuggested";
import {
  SearchResultsPanel,
  type ResultItem,
  type ResultSection,
} from "./SearchResultsPanel";

interface Fn {
  id: string;
  name: string;
}

const PAGE_ITEMS: ResultItem[] = [
  { id: "go-functions", label: "Go to Functions", hint: "Page", path: "/functions" },
  { id: "go-runs", label: "Go to Runs", hint: "Page", path: "/runs" },
  { id: "go-keys", label: "Go to API Keys", hint: "Page", path: "/keys" },
  { id: "go-settings", label: "Go to Settings", hint: "Page", path: "/settings" },
];

export function TopBarSearch() {
  const [mac, setMac] = useState(false);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [fns, setFns] = useState<Fn[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const nav = useNavigate();
  const location = useLocation();
  const { request } = useApi();
  const { recents, pushRecent } = useRecentSearches();

  useEffect(() => {
    setMac(navigator.platform.toLowerCase().includes("mac"));
  }, []);

  // Cmd/Ctrl+K focuses the input (focus handler opens the panel).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Fetch functions lazily the first time the panel opens.
  useEffect(() => {
    if (!open || fns.length > 0) return;
    request<{ functions: Fn[] }>("/api/functions")
      .then((r) => setFns(r.functions))
      .catch(() => {
        /* surfaced as empty results; ignore */
      });
  }, [open, fns.length, request]);

  // Close on route change.
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  const fnItems: ResultItem[] = useMemo(
    () =>
      fns.map((f) => ({
        id: `fn-${f.id}`,
        label: f.name,
        hint: "Function",
        path: `/functions/${f.id}`,
      })),
    [fns],
  );

  const sections: ResultSection[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const matchPages = PAGE_ITEMS.filter((i) =>
      i.label.toLowerCase().includes(q),
    );
    const matchFns = fnItems.filter((i) => i.label.toLowerCase().includes(q));
    const out: ResultSection[] = [];
    if (matchPages.length > 0) out.push({ id: "pages", title: "Pages", items: matchPages });
    if (matchFns.length > 0) out.push({ id: "functions", title: "Functions", items: matchFns });
    return out;
  }, [query, fnItems]);

  const flatItems: ResultItem[] = useMemo(() => {
    if (query.trim() === "") {
      return [...recents, ...SUGGESTED_ITEMS];
    }
    return sections.flatMap((s) => s.items);
  }, [query, sections, recents]);

  // Reset selection when the visible list changes.
  useEffect(() => {
    setSelectedIndex(0);
  }, [query, recents.length, sections.length]);

  function handleSelect(item: ResultItem) {
    pushRecent({
      id: item.id,
      label: item.label,
      hint: item.hint,
      path: item.path,
    } satisfies RecentItem);
    setOpen(false);
    setQuery("");
    inputRef.current?.blur();
    nav(item.path);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        setOpen(false);
        inputRef.current?.blur();
      }
      return;
    }
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (flatItems.length === 0) return;
      setSelectedIndex((i) => (i + 1) % flatItems.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (flatItems.length === 0) return;
      setSelectedIndex((i) => (i - 1 + flatItems.length) % flatItems.length);
    } else if (e.key === "Enter") {
      const item = flatItems[selectedIndex];
      if (item) {
        e.preventDefault();
        handleSelect(item);
      }
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen} modal={false}>
      <PopoverAnchor asChild>
        <div
          ref={anchorRef}
          className="flex w-72 items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2.5 text-sm focus-within:border-ring focus-within:ring-1 focus-within:ring-ring"
        >
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (!open) setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={handleKeyDown}
            placeholder="Search or jump to…"
            className="min-w-0 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          <kbd className="ml-2 whitespace-nowrap rounded bg-accent px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
            {mac ? "⌘K" : "Ctrl K"}
          </kbd>
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="center"
        sideOffset={8}
        className="w-[min(560px,90vw)] p-0"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => {
          if (anchorRef.current?.contains(e.target as Node)) {
            e.preventDefault();
          }
        }}
        onFocusOutside={(e) => {
          if (anchorRef.current?.contains(e.target as Node)) {
            e.preventDefault();
          }
        }}
      >
        <SearchResultsPanel
          query={query}
          sections={sections}
          recents={recents}
          suggested={SUGGESTED_ITEMS}
          selectedIndex={selectedIndex}
          onSelect={handleSelect}
          onHoverIndex={setSelectedIndex}
        />
      </PopoverContent>
    </Popover>
  );
}
