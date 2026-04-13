# nvoke UI/UX Redesign

**Date:** 2026-04-12
**Status:** Approved (brainstorming phase)

## Goal

Replace the current top-bar shell with a sidebar-driven layout and refresh the visual language across all pages. Surface execution history as a first-class concept.

## Shell Layout

Two-pane application shell:

- **Left sidebar:** fixed width 240px, collapsible to a 64px icon rail. Persists collapse state in `localStorage`.
- **Main area:** fills remaining viewport. No top bar.

### Sidebar structure (top → bottom)

1. **Logo block** — `nvoke` wordmark with a small muted `run` tag next to it. Clicking navigates to Functions.
2. **Primary nav** — icon + label rows, in order:
   - Functions
   - Runs *(new page)*
   - API Keys
   - Settings
3. **Flex spacer**
4. **User block** — avatar, display name, email (muted). Click opens a popover with: Account, Theme toggle, Sign out. Backed by Clerk user data but rendered in custom chrome (not Clerk's default `UserButton`).

Active nav item styling: tinted background (`violet-400/10`), 2px left accent bar in `violet-400`, white foreground. Inactive rows: `zinc-400` foreground, hover raises to `zinc-200` with a faint `white/5` background.

## Visual Language

- **Mode:** dark-first. Light mode deferred (toggle stub in user popover, not wired in this pass).
- **Palette:**
  - Sidebar background: `zinc-950`
  - Canvas background: `zinc-900`
  - Card / panel: `zinc-900` with `white/5` hairline border
  - Muted text: `zinc-400`
  - Primary text: `zinc-100`
  - Accent: `violet-400` (active state, primary CTAs, run status highlights)
- **Typography:** Inter for UI, JetBrains Mono for code, IDs, and timestamps.
- **Shape:** `rounded-lg` on cards and buttons, `rounded-md` on inputs. No heavy shadows — rely on borders and background steps.
- **Motion:** 150ms ease for hover/active transitions. Run button state changes use a short spinner-to-pill morph.

## Pages

### Functions (list)

Dense table with columns:

- Name (bold, primary text)
- Last run status (colored dot: green success, red fail, zinc idle)
- Last run time (relative, e.g. "2m ago")
- Invocations — 7-day sparkline
- Row kebab menu: Rename, Duplicate, Delete

Header row above the table:

- Left: search input (filters by name)
- Right: **New function** primary button (violet)

**Empty state:** large centered card with illustration slot, headline "No functions yet", body copy, and a **Create your first function** CTA.

### Function detail

Split view:

- **Left ~60%:** Monaco editor, full-height.
- **Right ~40%:** tabbed panel with tabs:
  - **Input** — JSON editor for the payload sent on Run
  - **Output** — last run's return value, pretty-printed
  - **Logs** — stdout/stderr from the last run
  - **Info** — function id, created/updated timestamps, invoke URL, copy buttons

Sticky header across both panes:

- Left: function name, inline-editable on click
- Right: **Save** (secondary) and **Run** (primary violet)

**Run button states:** idle → running (spinner + "Running…") → success pill (green check + duration) → fail pill (red x + duration). Auto-reverts to idle after 4s.

### Runs *(new)*

Global execution history across all functions. Page layout:

- Filter bar: function (multi-select), status (success/fail/all), time range (last hour / 24h / 7d / custom)
- Table: function name, status dot, started at, duration, triggered by (UI / API key name)
- Row click expands inline to show stdout, stderr, input, output, and a **Open function** link

Backed by existing run records in the database (exposed via a new `GET /api/runs` endpoint if one doesn't exist — confirm during planning).

### API Keys

Card list, one card per key:

- Key name, masked key with reveal (click-to-reveal, not hover)
- Created date, last used
- Copy button, Revoke button (confirm dialog)

Top-right: **New API key** primary button. Creation flow shows the full key once in a modal with a copy-to-clipboard step.

### Settings

Sectioned single page:

- **Profile** — name, email (read-only from Clerk)
- **Appearance** — theme toggle stub (disabled with "Coming soon" label)
- **Danger zone** — delete account (confirm via typed name)

## Interactions

- **Command palette (Cmd/Ctrl-K):** jump to function by name, create function, run last function. Opens as a centered modal over a dimmed canvas.
- **Toasts:** bottom-right, stacked, auto-dismiss 4s. Used for run results, key copy, save confirmation, errors.
- **No global keyboard shortcuts** beyond the command palette trigger. (Explicit scope decision — navigation hotkeys are out.)

## Component Inventory

New / reworked components (names indicative, final names decided during planning):

- `AppShell` — two-pane layout, hosts sidebar + outlet
- `Sidebar` — logo, nav list, user block
- `SidebarNavItem` — icon + label row with active state
- `UserBlock` — avatar + name + popover
- `CommandPalette` — Cmd-K modal
- `Toaster` — toast host (use existing if one is present)
- `StatusDot` — shared success/fail/idle indicator
- `RunButton` — morphing run button with state machine
- `Sparkline` — tiny 7-day invocation chart
- `EmptyState` — reusable empty-state card
- `RunsTable`, `RunRow`, `RunRowDetail` — for the new Runs page
- `Tabs` (if not already in the shadcn set) — for function detail right panel

Existing `TopBar.tsx` is removed. Routing moves under `AppShell` so every authed page gets the sidebar for free.

## Scope Boundaries

**In scope:**
- New shell, sidebar, visual refresh
- Functions list redesign with sparkline + status dots
- Function detail split view with tabbed right panel
- New Runs page (requires API endpoint if missing)
- API Keys + Settings visual refresh
- Command palette (Cmd-K only)
- Dark mode only

**Out of scope (deferred):**
- Light mode wiring
- Global keyboard navigation shortcuts
- Mobile / narrow-viewport layouts beyond basic responsiveness
- Backend changes beyond a single `GET /api/runs` endpoint if one does not already exist
- Any auth or billing changes

## Open Questions for Planning Phase

- Does a runs endpoint / run persistence already exist? If not, planning must include schema + endpoint work.
- Is a Tabs primitive already present in the shadcn set, or does it need to be added?
- Does a toast primitive already exist?

These are verification tasks for the implementation plan, not blockers for this spec.
