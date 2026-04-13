# Global Search Dropdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the modal `CommandPalette` with an anchored `Popover` dropdown that expands from the existing top-nav search input, with a Recent + Suggested empty state and `localStorage`-backed recents.

**Architecture:** A new `TopBarSearch` component renders a real `<input>` inside `TopBar`, wrapped in a non-modal Radix `Popover`. A presentational `SearchResultsPanel` renders either the empty state (Recent + Suggested sections) or the filtered results list. A small `useRecentSearches` hook persists the last 5 selections to `localStorage`.

**Tech Stack:** React 18, React Router, TypeScript, Tailwind, shadcn/ui patterns, Radix UI (`@radix-ui/react-popover` to be added), Vite.

**Codebase conventions picked up from exploration:**
- shadcn primitives live at `apps/web/src/components/ui/*.tsx`.
- Hooks / utilities live in `apps/web/src/lib/*.ts` (see `lib/api.ts`).
- No test runner is configured in the project. Verification is **manual in the browser + TypeScript typecheck + build**. Adding Vitest is out of scope for this plan.
- `apps/web` follows the hard rule: **theme tokens only**, no hardcoded palette colors.
- Cmd/Ctrl+K must keep working.

**Spec reconciliation:** the design doc refers to "grouped results" but the current `CommandPalette` filters a flat `actions` array containing nav shortcuts + functions. This plan preserves that flat structure but renders two labeled sections (`Pages`, `Functions`) when a query is present, which satisfies the spec's intent without inventing new data sources.

---

## File Structure

**New files:**
- `apps/web/src/components/ui/popover.tsx` — shadcn-style wrapper around `@radix-ui/react-popover`.
- `apps/web/src/components/TopBarSearch.tsx` — stateful container: input, popover, data fetching, keyboard handling, recents.
- `apps/web/src/components/SearchResultsPanel.tsx` — presentational panel: empty state and results state.
- `apps/web/src/lib/useRecentSearches.ts` — `localStorage`-backed recents hook.
- `apps/web/src/lib/searchSuggested.ts` — static suggested shortcuts config.

**Modified:**
- `apps/web/src/components/TopBar.tsx` — replace the fake-search button with `<TopBarSearch />`.
- `apps/web/src/components/AppShell.tsx` — remove `<CommandPalette />` mount.
- `apps/web/package.json` — add `@radix-ui/react-popover` dependency.

**Deleted:**
- `apps/web/src/components/CommandPalette.tsx` — logic absorbed into `TopBarSearch` and `SearchResultsPanel`.

---

## Task 1: Add the Popover dependency and primitive

**Files:**
- Modify: `apps/web/package.json`
- Create: `apps/web/src/components/ui/popover.tsx`

- [ ] **Step 1: Install `@radix-ui/react-popover`**

Run (from repo root, matching how `@radix-ui/react-dialog` was installed):

```bash
cd nvoke.run/apps/web && npm install @radix-ui/react-popover@^1.1.15
```

Expected: `package.json` now lists `"@radix-ui/react-popover": "^1.1.15"` and `package-lock.json` updates.

- [ ] **Step 2: Create the shadcn-style popover primitive**

Create `apps/web/src/components/ui/popover.tsx`:

```tsx
import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";

const Popover = PopoverPrimitive.Root;
const PopoverTrigger = PopoverPrimitive.Trigger;
const PopoverAnchor = PopoverPrimitive.Anchor;

const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({ className, align = "center", sideOffset = 8, ...props }, ref) => (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      className={
        "z-50 rounded-md border border-border bg-popover text-popover-foreground shadow-lg outline-none " +
        (className ?? "")
      }
      {...props}
    />
  </PopoverPrimitive.Portal>
));
PopoverContent.displayName = PopoverPrimitive.Content.displayName;

export { Popover, PopoverTrigger, PopoverAnchor, PopoverContent };
```

- [ ] **Step 3: Verify typecheck passes**

Run:

```bash
cd nvoke.run/apps/web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add nvoke.run/apps/web/package.json nvoke.run/apps/web/package-lock.json nvoke.run/apps/web/src/components/ui/popover.tsx
git commit -m "feat(web): add radix popover primitive"
```

---

## Task 2: `useRecentSearches` hook

**Files:**
- Create: `apps/web/src/lib/useRecentSearches.ts`

- [ ] **Step 1: Create the hook**

Create `apps/web/src/lib/useRecentSearches.ts`:

```ts
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
```

- [ ] **Step 2: Verify typecheck passes**

Run:

```bash
cd nvoke.run/apps/web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add nvoke.run/apps/web/src/lib/useRecentSearches.ts
git commit -m "feat(web): add useRecentSearches hook"
```

---

## Task 3: Suggested shortcuts config

**Files:**
- Create: `apps/web/src/lib/searchSuggested.ts`

- [ ] **Step 1: Create the static config**

Create `apps/web/src/lib/searchSuggested.ts`:

```ts
import type { RecentItem } from "./useRecentSearches";

export const SUGGESTED_ITEMS: RecentItem[] = [
  { id: "sug-functions", label: "Functions", hint: "Jump to page", path: "/functions" },
  { id: "sug-runs", label: "Runs", hint: "Jump to page", path: "/runs" },
  { id: "sug-keys", label: "API Keys", hint: "Jump to page", path: "/keys" },
  { id: "sug-settings", label: "Settings", hint: "Jump to page", path: "/settings" },
];
```

- [ ] **Step 2: Verify typecheck passes**

Run:

```bash
cd nvoke.run/apps/web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add nvoke.run/apps/web/src/lib/searchSuggested.ts
git commit -m "feat(web): add suggested search shortcuts"
```

---

## Task 4: `SearchResultsPanel` presentational component

**Files:**
- Create: `apps/web/src/components/SearchResultsPanel.tsx`

- [ ] **Step 1: Create the component**

Create `apps/web/src/components/SearchResultsPanel.tsx`:

```tsx
import type { RecentItem } from "../lib/useRecentSearches";

export interface ResultItem {
  id: string;
  label: string;
  hint?: string;
  path: string;
}

export interface ResultSection {
  id: string;
  title: string;
  items: ResultItem[];
}

interface Props {
  query: string;
  sections: ResultSection[];
  recents: RecentItem[];
  suggested: RecentItem[];
  selectedIndex: number;
  onSelect: (item: ResultItem) => void;
  onHoverIndex: (index: number) => void;
}

function flatten(sections: ResultSection[]): ResultItem[] {
  return sections.flatMap((s) => s.items);
}

export function SearchResultsPanel({
  query,
  sections,
  recents,
  suggested,
  selectedIndex,
  onSelect,
  onHoverIndex,
}: Props) {
  const isEmptyState = query.trim() === "";

  const visible: ResultSection[] = isEmptyState
    ? [
        ...(recents.length > 0
          ? [{ id: "recent", title: "Recent", items: recents }]
          : []),
        { id: "suggested", title: "Suggested", items: suggested },
      ]
    : sections;

  const flat = flatten(visible);

  if (!isEmptyState && flat.length === 0) {
    return (
      <div className="p-4 text-center text-sm text-muted-foreground">
        No results
      </div>
    );
  }

  let runningIndex = -1;

  return (
    <div className="max-h-[min(480px,70vh)] overflow-auto p-1">
      {visible.map((section) => (
        <div key={section.id} className="py-1">
          <div className="px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {section.title}
          </div>
          {section.items.map((item) => {
            runningIndex += 1;
            const index = runningIndex;
            const isSelected = index === selectedIndex;
            return (
              <button
                key={`${section.id}-${item.id}`}
                type="button"
                onMouseDown={(e) => {
                  // prevent blur-before-click swallowing the select
                  e.preventDefault();
                }}
                onClick={() => onSelect(item)}
                onMouseEnter={() => onHoverIndex(index)}
                className={
                  "flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm " +
                  (isSelected
                    ? "bg-accent text-accent-foreground"
                    : "text-foreground hover:bg-accent hover:text-accent-foreground")
                }
              >
                <span>{item.label}</span>
                {item.hint && (
                  <span className="text-xs text-muted-foreground">{item.hint}</span>
                )}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck passes**

Run:

```bash
cd nvoke.run/apps/web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add nvoke.run/apps/web/src/components/SearchResultsPanel.tsx
git commit -m "feat(web): add SearchResultsPanel component"
```

---

## Task 5: `TopBarSearch` container

**Files:**
- Create: `apps/web/src/components/TopBarSearch.tsx`

- [ ] **Step 1: Create the component**

Create `apps/web/src/components/TopBarSearch.tsx`:

```tsx
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
        <div className="flex w-72 items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-1.5 text-sm focus-within:border-ring focus-within:ring-1 focus-within:ring-ring">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (!open) setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={handleKeyDown}
            placeholder="Search functions, jump to page…"
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          <kbd className="rounded bg-accent px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
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
```

Notes on behavior encoded above, keyed to the spec:

- `modal={false}` on `Popover` + `onOpenAutoFocus`/`onCloseAutoFocus` preventDefault keep focus in the input when the panel opens and do not yank it away when it closes.
- `onMouseDown` + `preventDefault` on result rows in `SearchResultsPanel` stops the input from blurring before the click fires. With `modal={false}`, Radix would otherwise treat clicks inside as outside focus events.
- Close on route change is handled by the `useLocation` effect.
- Click-outside and Escape-when-focus-is-inside-panel are handled by Radix Popover itself.

- [ ] **Step 2: Verify typecheck passes**

Run:

```bash
cd nvoke.run/apps/web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add nvoke.run/apps/web/src/components/TopBarSearch.tsx
git commit -m "feat(web): add TopBarSearch dropdown container"
```

---

## Task 6: Wire `TopBarSearch` into `TopBar`

**Files:**
- Modify: `apps/web/src/components/TopBar.tsx`

- [ ] **Step 1: Replace `TopBar.tsx` contents**

Replace the full contents of `apps/web/src/components/TopBar.tsx` with:

```tsx
import { TopBarSearch } from "./TopBarSearch";

export function TopBar() {
  return (
    <header className="flex h-14 shrink-0 items-center justify-center bg-sidebar px-5">
      <TopBarSearch />
    </header>
  );
}
```

- [ ] **Step 2: Verify typecheck passes**

Run:

```bash
cd nvoke.run/apps/web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add nvoke.run/apps/web/src/components/TopBar.tsx
git commit -m "feat(web): mount TopBarSearch in top nav"
```

---

## Task 7: Remove `CommandPalette`

**Files:**
- Modify: `apps/web/src/components/AppShell.tsx`
- Delete: `apps/web/src/components/CommandPalette.tsx`

- [ ] **Step 1: Remove the mount and import from `AppShell.tsx`**

Replace the full contents of `apps/web/src/components/AppShell.tsx` with:

```tsx
import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { Toaster } from "./Toaster";

export function AppShell() {
  return (
    <div className="flex h-screen bg-sidebar">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-hidden rounded-tl-xl border-l border-t border-border bg-card">
          <Outlet />
        </main>
      </div>
      <Toaster />
    </div>
  );
}
```

- [ ] **Step 2: Delete `CommandPalette.tsx`**

Run:

```bash
rm nvoke.run/apps/web/src/components/CommandPalette.tsx
```

- [ ] **Step 3: Verify nothing else imports `CommandPalette`**

Use the Grep tool to search for `CommandPalette` across `nvoke.run/apps/web/src`. Expected: zero matches.

- [ ] **Step 4: Verify typecheck passes**

Run:

```bash
cd nvoke.run/apps/web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add nvoke.run/apps/web/src/components/AppShell.tsx nvoke.run/apps/web/src/components/CommandPalette.tsx
git commit -m "refactor(web): remove CommandPalette modal"
```

---

## Task 8: Manual verification in the browser

**Files:** none (verification only)

- [ ] **Step 1: Build the app**

Run:

```bash
cd nvoke.run/apps/web && npm run build
```

Expected: build succeeds with no TypeScript or Vite errors.

- [ ] **Step 2: Start the dev server**

Run (in a separate terminal or with `run_in_background`):

```bash
cd nvoke.run/apps/web && npm run dev
```

Open the app in a browser.

- [ ] **Step 3: Walk the checklist**

For each item, confirm the observed behavior matches and note any mismatches:

1. **Focus opens.** Click the top-nav search input. The dropdown appears below it, anchored center, showing a `Suggested` section. If you have visited items previously, a `Recent` section appears above it.
2. **Cmd/Ctrl+K opens.** With focus elsewhere, press Cmd+K (Mac) or Ctrl+K. The input gains focus and the dropdown opens.
3. **Typing narrows.** Type a partial page name (e.g., `run`). The panel swaps to a `Pages` section with matching items. Type `xyznothing`. Panel shows `No results`.
4. **Arrow keys navigate.** With the panel open, press ↓ and ↑. Selection highlight moves across items and wraps at the ends. Section headers are skipped (the highlight never lands on `Pages`, `Recent`, etc.).
5. **Enter activates.** Press Enter on a selected item. The app navigates to that route, the panel closes, and the input clears.
6. **Recent persists.** Open the search again. The item you just picked appears at the top of the `Recent` section. Reload the page — it still appears.
7. **Click-outside closes.** Click anywhere outside the input and panel. Panel closes, input loses focus.
8. **Escape closes.** Open the panel, press Escape. Panel closes, input loses focus.
9. **Clicking inside the panel does NOT close it prematurely.** Open the panel, click-and-hold on a result row, then move the mouse off the row before releasing. Panel stays open (the click is cancelled but the panel does not close on the mousedown).
10. **Route change closes.** Open the panel, then click any sidebar link. Panel closes on navigation.
11. **Theming holds.** Open devtools, change a shadcn CSS variable (e.g., `--popover`) at `:root`. The panel's background updates live. No hardcoded hex/rgb colors should appear in the new components.

- [ ] **Step 4: Stop the dev server**

Stop the background dev process.

- [ ] **Step 5: If all checks passed, commit a verification note (optional)**

No file changes — skip the commit if nothing was adjusted. If any check failed, fix it in a follow-up task before marking this plan complete.

---

## Self-Review Notes

- **Spec coverage:**
  - Anchored dropdown via Popover — Task 1 + 5.
  - `TopBarSearch` owning input + state — Task 5.
  - `SearchResultsPanel` pure presentation — Task 4.
  - `useRecentSearches` with 5-cap, dedupe, SSR-safe — Task 2.
  - Open on focus / Cmd+K / typing, close on Escape / click-outside / select / route change, stays open on blur-into-panel — Task 5 + Task 8 checks 1-11.
  - Empty state = Recent then Suggested — Task 4 + Task 3.
  - Arrow-key nav skipping headers, wrap — Task 4 (runningIndex only increments on items) + Task 5 (mod arithmetic).
  - Width `min(560px, 90vw)`, `align="center"`, `shadow-lg border` — Task 1 + Task 5.
  - Theme tokens only — verified in Task 8 step 3 check 11.
  - `CommandPalette` deleted, `AppShell` updated — Task 7.
- **Placeholder scan:** none.
- **Type consistency:** `RecentItem` defined in Task 2, reused by Tasks 3, 4, 5. `ResultItem` / `ResultSection` defined in Task 4, imported in Task 5. `pushRecent` used in Task 5 matches the signature from Task 2.
- **Out of scope (acknowledged in spec):** server-side recents sync, dedicated mobile layout, automated tests (project has no test runner; adding Vitest is scope creep).
