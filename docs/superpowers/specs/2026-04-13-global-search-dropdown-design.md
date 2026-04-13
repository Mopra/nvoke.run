# Global Search: Anchored Dropdown Redesign

**Date:** 2026-04-13
**Status:** Approved design, pending implementation plan

## Problem

Global search currently opens as a centered modal (Radix `Dialog`) via `CommandPalette.tsx`. The user likes the feature but wants it to feel like a real top-nav search: the results should expand downward from the existing search bar in the top nav rather than taking over the screen as a lightbox.

Reference: Azure Portal's top-nav search — a centered search input that opens an anchored dropdown with recents and grouped results.

## Goals

- Replace the modal with an anchored dropdown that opens from the top-nav search input.
- Keep all existing search functionality (grouped results, keyboard nav, Cmd/Ctrl+K).
- Add a useful empty state (recent items + suggested shortcuts).
- Preserve the theme-token-only rule for `apps/web` so tweakcn themes continue to swap cleanly.

## Non-Goals

- Server-side recents sync (localStorage only for this iteration).
- Mobile-specific redesign. The dropdown must continue to work if the top nav collapses the search bar on narrow viewports, but no new mobile affordances are in scope.
- Changing the set of searchable entities or the result-fetching logic.

## Architecture

Refactor the existing `CommandPalette` into a `Popover`-based dropdown owned by the top bar. The search input becomes a real `<input>` in the top nav (not a button that fakes Cmd+K). The dropdown is a Radix `Popover` with `modal={false}` so focus stays in the input while the panel is open — this gives us collision detection, click-outside, and Escape handling for free, while allowing the input to retain focus and keep receiving keystrokes.

Alternatives considered:

- **Custom absolute-positioned `<div>`** — rejected. Re-implements collision/click-outside/Escape for no benefit.
- **Keep `Dialog` but render inline** — rejected. `Dialog` is modal by design; fighting it is worse than using the right primitive.

## Components

### `TopBarSearch` (new)

Owns:

- The `<input>` element rendered in `TopBar`.
- `open` state (boolean).
- `query` state (string).
- `selectedIndex` state (number) across the currently-visible flat list.
- Recent-items read/write via `useRecentSearches`.
- Result-fetching logic (moved from `CommandPalette` unchanged).
- The Popover anchor and trigger.

Renders `SearchResultsPanel` inside `PopoverContent`.

### `SearchResultsPanel` (new)

Pure presentation. Props:

- `query: string`
- `results: GroupedResults` (existing type from `CommandPalette`)
- `recents: RecentItem[]`
- `suggested: SuggestedItem[]` (static config)
- `selectedIndex: number`
- `onSelect: (item) => void`
- `onHoverIndex: (index: number) => void`

Renders either:

- **Empty state** (`query === ""`): `Recent` section followed by `Suggested` section.
- **Results state** (`query !== ""`): existing grouped result list with section headers.

### `useRecentSearches` (new hook)

- Reads/writes `localStorage` under a stable key. If a current user id is available from existing auth context, scope the key per-user (`nvoke:recent-searches:<userId>`); otherwise fall back to `nvoke:recent-searches`.
- Caps at 5 entries.
- Dedupes by item id when pushing.
- Returns `{ recents, pushRecent, clearRecents }`.
- SSR-safe: returns `[]` during initial render, hydrates on mount.

### Files Touched

- [TopBar.tsx](../../../apps/web/src/components/TopBar.tsx) — replace the fake search button with `<TopBarSearch />`.
- [CommandPalette.tsx](../../../apps/web/src/components/CommandPalette.tsx) — **deleted**. Logic absorbed into `TopBarSearch` and `SearchResultsPanel`.
- [AppShell.tsx](../../../apps/web/src/components/AppShell.tsx) — remove the `<CommandPalette />` mount.
- New: `apps/web/src/components/TopBarSearch.tsx`
- New: `apps/web/src/components/SearchResultsPanel.tsx`
- New: `apps/web/src/hooks/useRecentSearches.ts`

## Behavior

### Open / Close (hybrid)

**Opens on:**

- Input focus.
- Cmd/Ctrl+K — focuses the input, which opens the panel.
- Typing in the input.

**Closes on:**

- Escape key.
- Click outside the input + panel (handled by Popover).
- Selecting a result (keyboard Enter or mouse click).
- Route change (watch the router and close on navigation).

**Does NOT close on:**

- Input blur alone. This is critical — the user must be able to click into the panel (scroll, hover items) without it disappearing.

### Empty State

When `open === true && query === ""`:

1. **Recent** section — up to 5 items from `useRecentSearches`, newest first. Hidden entirely if empty.
2. **Suggested** section — static config list (e.g., Dashboard, New Invoice, Settings). Defined in `TopBarSearch.tsx` or a small constants file.

### Results State

When `query !== ""`: existing grouped results replace both empty-state sections. Group headers render as non-interactive labels; only result rows are selectable.

Selecting any item (recent, suggested, or search hit) calls `pushRecent(item)` before navigating.

### Keyboard Navigation

- `↑` / `↓`: move `selectedIndex` across the flat list of all currently-visible selectable items. Section headers are skipped. Wraps at top and bottom.
- `Enter`: activate the currently selected item.
- `Escape`: close the panel. If the panel is already closed, blur the input.
- `Cmd/Ctrl+K`: focus the input (opens the panel via the focus handler).
- Mouse hover over an item syncs `selectedIndex` to that item so keyboard and mouse stay in sync.

## Layout & Theming

- **Width:** `min(560px, 90vw)`.
- **Anchoring:** `align="center"` on `PopoverContent`, anchored to the search input — grows symmetrically left and right from the input's center.
- **Max height:** `min(480px, 70vh)`, with internal scroll on the results list.
- **Elevation:** `shadow-lg border` to read as floating over content below the nav.
- **Colors:** shadcn theme tokens only — `bg-popover`, `text-popover-foreground`, `border`, `ring`, `muted-foreground` for subtitles, `accent` for the selected row background. No hardcoded palette colors anywhere in the new components.
- **Spacing/typography:** match existing `CommandPalette` row styling so the visual result rows feel unchanged; only the container changes.

## Error Handling

- **Result fetch failure:** render a single non-selectable "Something went wrong" row inside the results area. Do not close the panel.
- **Empty results for a non-empty query:** render a single non-selectable "No results" row.
- **localStorage unavailable / parse error in `useRecentSearches`:** catch, log in dev, return `[]`. Writes become no-ops.

## Testing

- `useRecentSearches` unit tests: push/dedupe/cap at 5, clear, SSR-safe initial render.
- `SearchResultsPanel` component tests: renders empty state, renders results state, calls `onSelect` on click, respects `selectedIndex` styling.
- `TopBarSearch` integration tests: opens on focus, opens on Cmd/Ctrl+K, closes on Escape, closes on outside click, does not close on blur when clicking into the panel, closes on route change, keyboard arrow navigation skips headers and wraps.

## Out of Scope / Follow-ups

- Server-side recents sync across devices.
- Per-user suggested shortcuts (personalization based on usage).
- Dedicated mobile layout for the dropdown.
