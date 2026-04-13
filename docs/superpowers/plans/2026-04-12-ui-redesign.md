# nvoke UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the top-bar shell with a left sidebar, add a global Runs page, split API Keys out of Settings, and refresh the visual language across every authed page.

**Architecture:** Introduce an `AppShell` layout with a fixed `Sidebar` (logo, nav, user block). Route all authed pages under it. Add one new API endpoint for listing invocations across all functions for the current user. Add a Cmd-K command palette and a toast host. No test harness exists for the web app — verification is typecheck + manual run of the dev server.

**Tech Stack:** React 18, Vite, Tailwind, Radix UI, lucide-react, Monaco, Clerk, Fastify, pg, Zod. Reuses existing shadcn primitives (`button`, `dialog`, `input`, `tabs`, `table`, `badge`). Adds `sonner` for toasts.

**Spec:** `docs/superpowers/specs/2026-04-12-ui-redesign-design.md`

---

## File Structure

### API (new / modified)

- `apps/api/src/queries/invocations.ts` — add `listAllInvocations(userId, filters)`
- `apps/api/src/routes/invocations.ts` — add `GET /api/invocations` route

### Web (new)

- `apps/web/src/components/AppShell.tsx` — two-pane shell (sidebar + outlet)
- `apps/web/src/components/Sidebar.tsx` — sidebar container: logo, nav, user block
- `apps/web/src/components/SidebarNavItem.tsx` — single nav row
- `apps/web/src/components/UserBlock.tsx` — avatar + name + popover (Account / Sign out)
- `apps/web/src/components/StatusDot.tsx` — status indicator used in tables
- `apps/web/src/components/RunButton.tsx` — morphing run button (idle/running/success/fail)
- `apps/web/src/components/Sparkline.tsx` — tiny SVG 7-day invocation chart
- `apps/web/src/components/EmptyState.tsx` — reusable empty state card
- `apps/web/src/components/CommandPalette.tsx` — Cmd-K modal
- `apps/web/src/components/Toaster.tsx` — sonner host
- `apps/web/src/pages/RunsPage.tsx` — new Runs page
- `apps/web/src/pages/ApiKeysPage.tsx` — split out of Settings

### Web (modified)

- `apps/web/src/App.tsx` — render `AppShell` instead of `TopBar`
- `apps/web/src/router.tsx` — add routes for `/runs` and `/keys`
- `apps/web/src/pages/FunctionsListPage.tsx` — dense table with status dot, sparkline, empty state
- `apps/web/src/pages/FunctionDetailPage.tsx` — split view, tabbed right panel, RunButton
- `apps/web/src/pages/SettingsPage.tsx` — reduce to Profile + Appearance + Danger zone
- `apps/web/src/lib/api.ts` — add `listAllInvocations` helper (optional — or use raw `request`)
- `apps/web/src/index.css` — add base dark body + font variables
- `apps/web/tailwind.config.ts` — extend theme with violet accent alias, Inter + JetBrains Mono
- `apps/web/index.html` — add Inter + JetBrains Mono webfonts link
- `apps/web/package.json` — add `sonner` dep
- `apps/web/src/components/TopBar.tsx` — DELETE (replaced by Sidebar)

---

## Task 1: API — global invocations list endpoint

**Files:**
- Modify: `apps/api/src/queries/invocations.ts`
- Modify: `apps/api/src/routes/invocations.ts`

- [ ] **Step 1: Add `listAllInvocations` query**

In `apps/api/src/queries/invocations.ts`, append:

```ts
export const listAllInvocations = (
  userId: string,
  opts: { status?: "success" | "error" | "timeout"; limit?: number } = {},
) => {
  const params: unknown[] = [userId];
  let where = "user_id=$1";
  if (opts.status) {
    params.push(opts.status);
    where += ` AND status=$${params.length}`;
  }
  params.push(opts.limit ?? 100);
  return q<Invocation & { function_name?: string }>(
    `SELECT i.*, f.name AS function_name
     FROM invocations i
     JOIN functions f ON f.id = i.function_id
     WHERE ${where.replace(/user_id/g, "i.user_id")}
     ORDER BY i.started_at DESC
     LIMIT $${params.length}`,
    params,
  );
};
```

- [ ] **Step 2: Add `GET /api/invocations` route**

In `apps/api/src/routes/invocations.ts`, import the new query and add a route inside `invocationsRoutes`:

```ts
import { listInvocations, getInvocation, listAllInvocations } from "../queries/invocations.js";

const ListQuery = z.object({
  status: z.enum(["success", "error", "timeout"]).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

app.get("/api/invocations", async (req) => {
  const { status, limit } = ListQuery.parse(req.query);
  const rows = await listAllInvocations(req.user!.id, { status, limit });
  return {
    invocations: rows.map((r) => ({
      id: r.id,
      function_id: r.function_id,
      function_name: (r as { function_name?: string }).function_name ?? null,
      source: r.source,
      status: r.status,
      duration_ms: r.duration_ms,
      started_at: r.started_at,
      completed_at: r.completed_at,
    })),
  };
});
```

- [ ] **Step 3: Typecheck API**

Run: `npm -w apps/api run typecheck` (or `npm -w apps/api run build`)
Expected: no errors.

---

## Task 2: Web — theme, fonts, toasts dependency

**Files:**
- Modify: `apps/web/package.json`
- Modify: `apps/web/tailwind.config.ts`
- Modify: `apps/web/src/index.css`
- Modify: `apps/web/index.html`

- [ ] **Step 1: Install sonner**

Run: `npm -w apps/web install sonner`

- [ ] **Step 2: Extend Tailwind theme**

Replace `apps/web/tailwind.config.ts` with:

```ts
import type { Config } from "tailwindcss";

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      colors: {
        accent: {
          DEFAULT: "#a78bfa", // violet-400
          soft: "rgba(167, 139, 250, 0.1)",
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
```

- [ ] **Step 3: Update `index.css`**

Replace `apps/web/src/index.css` with:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  html, body, #root {
    @apply h-full bg-zinc-950 text-zinc-100 font-sans antialiased;
  }
  body {
    color-scheme: dark;
  }
}
```

- [ ] **Step 4: Load webfonts in `index.html`**

In `apps/web/index.html`, add inside `<head>`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link
  href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
  rel="stylesheet"
>
```

- [ ] **Step 5: Typecheck**

Run: `npm -w apps/web run typecheck`
Expected: no errors.

---

## Task 3: Web — shared visual primitives

**Files:**
- Create: `apps/web/src/components/StatusDot.tsx`
- Create: `apps/web/src/components/Sparkline.tsx`
- Create: `apps/web/src/components/EmptyState.tsx`
- Create: `apps/web/src/components/Toaster.tsx`
- Create: `apps/web/src/components/RunButton.tsx`

- [ ] **Step 1: `StatusDot.tsx`**

```tsx
import { cn } from "@/lib/cn";

type Status = "success" | "error" | "timeout" | "idle" | "running";

const COLORS: Record<Status, string> = {
  success: "bg-emerald-400 shadow-[0_0_0_3px_rgba(52,211,153,0.15)]",
  error: "bg-red-400 shadow-[0_0_0_3px_rgba(248,113,113,0.15)]",
  timeout: "bg-amber-400 shadow-[0_0_0_3px_rgba(251,191,36,0.15)]",
  running: "bg-violet-400 animate-pulse",
  idle: "bg-zinc-600",
};

export function StatusDot({ status, className }: { status: Status; className?: string }) {
  return <span className={cn("inline-block h-2 w-2 rounded-full", COLORS[status], className)} />;
}
```

- [ ] **Step 2: `Sparkline.tsx`**

```tsx
export function Sparkline({ values, width = 80, height = 20 }: { values: number[]; width?: number; height?: number }) {
  if (values.length === 0) return <div className="h-5 w-20 text-[10px] text-zinc-600">—</div>;
  const max = Math.max(...values, 1);
  const step = width / Math.max(values.length - 1, 1);
  const points = values.map((v, i) => `${i * step},${height - (v / max) * height}`).join(" ");
  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline
        fill="none"
        stroke="#a78bfa"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}
```

- [ ] **Step 3: `EmptyState.tsx`**

```tsx
import type { ReactNode } from "react";

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon?: ReactNode;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-xl border border-white/5 bg-zinc-900/60 px-8 py-12 text-center">
      {icon && <div className="text-violet-400">{icon}</div>}
      <h3 className="text-base font-semibold text-zinc-100">{title}</h3>
      {body && <p className="text-sm text-zinc-400">{body}</p>}
      {action && <div className="pt-2">{action}</div>}
    </div>
  );
}
```

- [ ] **Step 4: `Toaster.tsx`**

```tsx
import { Toaster as SonnerToaster } from "sonner";

export function Toaster() {
  return (
    <SonnerToaster
      position="bottom-right"
      theme="dark"
      toastOptions={{
        style: {
          background: "#18181b",
          border: "1px solid rgba(255,255,255,0.06)",
          color: "#fafafa",
        },
      }}
    />
  );
}
```

- [ ] **Step 5: `RunButton.tsx`**

```tsx
import { Play, Loader2, Check, X } from "lucide-react";
import { cn } from "@/lib/cn";

type RunState = "idle" | "running" | "success" | "error";

export function RunButton({
  state,
  duration,
  onClick,
  disabled,
}: {
  state: RunState;
  duration?: number;
  onClick: () => void;
  disabled?: boolean;
}) {
  const base =
    "inline-flex items-center gap-2 rounded-md px-4 h-9 text-sm font-medium transition-colors disabled:opacity-50";
  if (state === "running") {
    return (
      <button disabled className={cn(base, "bg-violet-500/20 text-violet-200")}>
        <Loader2 className="h-4 w-4 animate-spin" /> Running…
      </button>
    );
  }
  if (state === "success") {
    return (
      <button onClick={onClick} className={cn(base, "bg-emerald-500/20 text-emerald-300")}>
        <Check className="h-4 w-4" /> {duration}ms
      </button>
    );
  }
  if (state === "error") {
    return (
      <button onClick={onClick} className={cn(base, "bg-red-500/20 text-red-300")}>
        <X className="h-4 w-4" /> Failed
      </button>
    );
  }
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(base, "bg-violet-500 text-white hover:bg-violet-400")}
    >
      <Play className="h-4 w-4" /> Run
    </button>
  );
}
```

- [ ] **Step 6: Typecheck**

Run: `npm -w apps/web run typecheck`
Expected: no errors.

---

## Task 4: Web — Sidebar, UserBlock, AppShell

**Files:**
- Create: `apps/web/src/components/SidebarNavItem.tsx`
- Create: `apps/web/src/components/UserBlock.tsx`
- Create: `apps/web/src/components/Sidebar.tsx`
- Create: `apps/web/src/components/AppShell.tsx`
- Modify: `apps/web/src/App.tsx`
- Delete: `apps/web/src/components/TopBar.tsx`

- [ ] **Step 1: `SidebarNavItem.tsx`**

```tsx
import { NavLink } from "react-router-dom";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function SidebarNavItem({ to, icon, label }: { to: string; icon: ReactNode; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          "relative flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
          isActive
            ? "bg-violet-400/10 text-zinc-50"
            : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200",
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r bg-violet-400" />
          )}
          <span className={cn("flex h-4 w-4 items-center justify-center", isActive && "text-violet-300")}>
            {icon}
          </span>
          <span className="truncate">{label}</span>
        </>
      )}
    </NavLink>
  );
}
```

- [ ] **Step 2: `UserBlock.tsx`**

```tsx
import { useUser, useClerk } from "@clerk/clerk-react";
import { useState, useRef, useEffect } from "react";
import { LogOut } from "lucide-react";

export function UserBlock() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  if (!user) return null;
  const name = user.fullName ?? user.primaryEmailAddress?.emailAddress ?? "User";
  const email = user.primaryEmailAddress?.emailAddress ?? "";
  const initials = name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div ref={ref} className="relative">
      {open && (
        <div className="absolute bottom-full left-0 right-0 mb-2 rounded-lg border border-white/5 bg-zinc-900 p-1 shadow-xl">
          <button
            onClick={() => signOut()}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-zinc-200 hover:bg-white/5"
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      )}
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 rounded-md p-2 text-left transition-colors hover:bg-white/5"
      >
        {user.imageUrl ? (
          <img src={user.imageUrl} alt="" className="h-8 w-8 rounded-full" />
        ) : (
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-500/20 text-xs font-semibold text-violet-200">
            {initials}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-zinc-100">{name}</div>
          <div className="truncate text-xs text-zinc-500">{email}</div>
        </div>
      </button>
    </div>
  );
}
```

- [ ] **Step 3: `Sidebar.tsx`**

```tsx
import { Link } from "react-router-dom";
import { Code2, History, KeyRound, Settings } from "lucide-react";
import { SidebarNavItem } from "./SidebarNavItem";
import { UserBlock } from "./UserBlock";

export function Sidebar() {
  return (
    <aside className="flex h-screen w-60 shrink-0 flex-col border-r border-white/5 bg-zinc-950 p-3">
      <Link to="/functions" className="mb-6 flex items-center gap-2 px-2 py-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-violet-500/20 text-violet-300">
          <Code2 className="h-4 w-4" />
        </div>
        <div className="leading-tight">
          <div className="text-base font-semibold text-zinc-50">nvoke</div>
          <div className="text-[10px] uppercase tracking-wider text-zinc-500">run</div>
        </div>
      </Link>

      <nav className="flex flex-1 flex-col gap-1">
        <SidebarNavItem to="/functions" icon={<Code2 className="h-4 w-4" />} label="Functions" />
        <SidebarNavItem to="/runs" icon={<History className="h-4 w-4" />} label="Runs" />
        <SidebarNavItem to="/keys" icon={<KeyRound className="h-4 w-4" />} label="API Keys" />
        <SidebarNavItem to="/settings" icon={<Settings className="h-4 w-4" />} label="Settings" />
      </nav>

      <div className="mt-3 border-t border-white/5 pt-3">
        <UserBlock />
      </div>
    </aside>
  );
}
```

- [ ] **Step 4: `AppShell.tsx`**

```tsx
import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Toaster } from "./Toaster";
import { CommandPalette } from "./CommandPalette";

export function AppShell() {
  return (
    <div className="flex h-screen bg-zinc-950">
      <Sidebar />
      <main className="flex-1 overflow-auto bg-zinc-900">
        <div className="mx-auto max-w-6xl px-8 py-8">
          <Outlet />
        </div>
      </main>
      <Toaster />
      <CommandPalette />
    </div>
  );
}
```

- [ ] **Step 5: Replace `App.tsx`**

Replace the file contents with:

```tsx
import { AppShell } from "./components/AppShell";

export default function App() {
  return <AppShell />;
}
```

- [ ] **Step 6: Delete `TopBar.tsx`**

Run: `rm apps/web/src/components/TopBar.tsx`

*(Note: `CommandPalette` is created in Task 5 — typecheck happens after that task.)*

---

## Task 5: Web — Command palette

**Files:**
- Create: `apps/web/src/components/CommandPalette.tsx`

- [ ] **Step 1: Implement `CommandPalette.tsx`**

```tsx
import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useApi } from "../lib/api";
import { Search } from "lucide-react";

interface Fn { id: string; name: string }

type Action = { id: string; label: string; hint?: string; run: () => void };

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [fns, setFns] = useState<Fn[]>([]);
  const nav = useNavigate();
  const { request } = useApi();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    request<{ functions: Fn[] }>("/api/functions").then((r) => setFns(r.functions));
    setQuery("");
  }, [open]);

  const actions: Action[] = useMemo(() => {
    const base: Action[] = [
      { id: "go-functions", label: "Go to Functions", run: () => nav("/functions") },
      { id: "go-runs", label: "Go to Runs", run: () => nav("/runs") },
      { id: "go-keys", label: "Go to API Keys", run: () => nav("/keys") },
      { id: "go-settings", label: "Go to Settings", run: () => nav("/settings") },
    ];
    const fnActions = fns.map((f) => ({
      id: `fn-${f.id}`,
      label: f.name,
      hint: "Open function",
      run: () => nav(`/functions/${f.id}`),
    }));
    return [...base, ...fnActions];
  }, [fns, nav]);

  const filtered = actions.filter((a) => a.label.toLowerCase().includes(query.toLowerCase()));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-lg p-0">
        <div className="flex items-center gap-2 border-b border-white/5 px-4 py-3">
          <Search className="h-4 w-4 text-zinc-500" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search functions, jump to page…"
            className="flex-1 bg-transparent text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none"
          />
          <kbd className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-zinc-500">ESC</kbd>
        </div>
        <div className="max-h-80 overflow-auto p-1">
          {filtered.length === 0 ? (
            <div className="p-4 text-center text-sm text-zinc-500">No results</div>
          ) : (
            filtered.map((a) => (
              <button
                key={a.id}
                onClick={() => {
                  a.run();
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm text-zinc-200 hover:bg-white/5"
              >
                <span>{a.label}</span>
                {a.hint && <span className="text-xs text-zinc-500">{a.hint}</span>}
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm -w apps/web run typecheck`
Expected: no errors.

---

## Task 6: Web — Router with new routes

**Files:**
- Modify: `apps/web/src/router.tsx`

- [ ] **Step 1: Update router**

Replace contents with:

```tsx
import { createBrowserRouter, Navigate } from "react-router-dom";
import { SignedIn, SignedOut, RedirectToSignIn } from "@clerk/clerk-react";
import App from "./App";
import SignInPage from "./pages/SignInPage";
import SignUpPage from "./pages/SignUpPage";
import FunctionsListPage from "./pages/FunctionsListPage";
import FunctionDetailPage from "./pages/FunctionDetailPage";
import RunsPage from "./pages/RunsPage";
import ApiKeysPage from "./pages/ApiKeysPage";
import SettingsPage from "./pages/SettingsPage";

function Protected() {
  return (
    <>
      <SignedIn>
        <App />
      </SignedIn>
      <SignedOut>
        <RedirectToSignIn />
      </SignedOut>
    </>
  );
}

export const router = createBrowserRouter([
  { path: "/sign-in/*", element: <SignInPage /> },
  { path: "/sign-up/*", element: <SignUpPage /> },
  {
    path: "/",
    element: <Protected />,
    children: [
      { index: true, element: <Navigate to="/functions" replace /> },
      { path: "functions", element: <FunctionsListPage /> },
      { path: "functions/:id", element: <FunctionDetailPage /> },
      { path: "runs", element: <RunsPage /> },
      { path: "keys", element: <ApiKeysPage /> },
      { path: "settings", element: <SettingsPage /> },
    ],
  },
]);
```

*(Typecheck deferred until pages exist — Tasks 7–10.)*

---

## Task 7: Web — Rewrite FunctionsListPage

**Files:**
- Modify: `apps/web/src/pages/FunctionsListPage.tsx`

- [ ] **Step 1: Replace file contents**

```tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Search, MoreHorizontal, Code2 } from "lucide-react";
import { useApi } from "../lib/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { StatusDot } from "@/components/StatusDot";
import { Sparkline } from "@/components/Sparkline";
import { EmptyState } from "@/components/EmptyState";

interface Fn {
  id: string;
  name: string;
  created_at: string;
}

interface Invocation {
  id: string;
  function_id: string;
  status: "success" | "error" | "timeout";
  started_at: string;
}

const DEFAULT_CODE = `export default async function (input, ctx) {
  ctx.log("hello", input);
  return { echo: input };
}
`;

function relTime(iso: string): string {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return `${Math.floor(d)}s ago`;
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}

export default function FunctionsListPage() {
  const { request } = useApi();
  const nav = useNavigate();
  const [fns, setFns] = useState<Fn[]>([]);
  const [invs, setInvs] = useState<Invocation[]>([]);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  async function load() {
    const [f, i] = await Promise.all([
      request<{ functions: Fn[] }>("/api/functions"),
      request<{ invocations: Invocation[] }>("/api/invocations?limit=500"),
    ]);
    setFns(f.functions);
    setInvs(i.invocations);
  }

  useEffect(() => {
    load();
  }, []);

  async function create() {
    const res = await request<{ function: Fn }>("/api/functions", {
      method: "POST",
      body: JSON.stringify({ name, code: DEFAULT_CODE }),
    });
    setOpen(false);
    setName("");
    nav(`/functions/${res.function.id}`);
  }

  function statsFor(fnId: string) {
    const mine = invs.filter((i) => i.function_id === fnId);
    const last = mine[0];
    const now = Date.now();
    const buckets = Array.from({ length: 7 }, () => 0);
    for (const i of mine) {
      const day = Math.floor((now - new Date(i.started_at).getTime()) / 86400000);
      if (day >= 0 && day < 7) buckets[6 - day]++;
    }
    return { last, sparkline: buckets };
  }

  const filtered = fns.filter((f) => f.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-50">Functions</h1>
          <p className="text-sm text-zinc-500">Write, run, and manage small Node.js functions.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              className="w-56 pl-9"
            />
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="bg-violet-500 text-white hover:bg-violet-400">
                <Plus className="mr-1 h-4 w-4" /> New function
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New function</DialogTitle>
              </DialogHeader>
              <Input
                placeholder="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <DialogFooter>
                <Button onClick={create} disabled={!name}>Create</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {fns.length === 0 ? (
        <EmptyState
          icon={<Code2 className="h-8 w-8" />}
          title="No functions yet"
          body="Create your first function to start writing and running Node.js code in the cloud."
          action={
            <Button onClick={() => setOpen(true)} className="bg-violet-500 text-white hover:bg-violet-400">
              <Plus className="mr-1 h-4 w-4" /> Create your first function
            </Button>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-white/5 bg-zinc-900/40">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/5 text-left text-xs uppercase tracking-wider text-zinc-500">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Last run</th>
                <th className="px-4 py-3 font-medium">Invocations (7d)</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((f) => {
                const { last, sparkline } = statsFor(f.id);
                return (
                  <tr
                    key={f.id}
                    onClick={() => nav(`/functions/${f.id}`)}
                    className="cursor-pointer border-b border-white/5 transition-colors last:border-0 hover:bg-white/5"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <StatusDot status={last ? last.status : "idle"} />
                        <span className="font-medium text-zinc-100">{f.name}</span>
                      </div>
                      <div className="mt-0.5 font-mono text-[10px] text-zinc-600">{f.id.slice(0, 8)}</div>
                    </td>
                    <td className="px-4 py-3 text-sm text-zinc-400">
                      {last ? relTime(last.started_at) : "Never"}
                    </td>
                    <td className="px-4 py-3">
                      <Sparkline values={sparkline} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <MoreHorizontal className="inline h-4 w-4 text-zinc-600" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

---

## Task 8: Web — Rewrite FunctionDetailPage

**Files:**
- Modify: `apps/web/src/pages/FunctionDetailPage.tsx`

- [ ] **Step 1: Replace file contents**

```tsx
import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import Editor from "@monaco-editor/react";
import { ArrowLeft, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useApi } from "../lib/api";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RunButton } from "@/components/RunButton";
import { StatusDot } from "@/components/StatusDot";

interface Fn {
  id: string;
  name: string;
  code: string;
}

interface InvokeResponse {
  invocation_id: string;
  status: "success" | "error" | "timeout";
  output: unknown;
  logs: string[] | null;
  error: string | null;
  duration_ms: number;
}

type RunState = "idle" | "running" | "success" | "error";

export default function FunctionDetailPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const { request } = useApi();
  const [fn, setFn] = useState<Fn | null>(null);
  const [dirty, setDirty] = useState(false);
  const [inputText, setInputText] = useState('{\n  "name": "world"\n}');
  const [result, setResult] = useState<InvokeResponse | null>(null);
  const [runState, setRunState] = useState<RunState>("idle");

  useEffect(() => {
    if (!id) return;
    request<{ function: Fn }>(`/api/functions/${id}`).then((r) => setFn(r.function));
  }, [id]);

  useEffect(() => {
    if (runState === "success" || runState === "error") {
      const t = setTimeout(() => setRunState("idle"), 4000);
      return () => clearTimeout(t);
    }
  }, [runState]);

  async function save() {
    if (!fn) return;
    await request(`/api/functions/${fn.id}`, {
      method: "PUT",
      body: JSON.stringify({ name: fn.name, code: fn.code }),
    });
    setDirty(false);
    toast.success("Saved");
  }

  async function remove() {
    if (!fn || !confirm("Delete this function?")) return;
    await request(`/api/functions/${fn.id}`, { method: "DELETE" });
    nav("/functions");
  }

  async function run() {
    if (!fn) return;
    setRunState("running");
    try {
      if (dirty) await save();
      let input: unknown;
      try {
        input = JSON.parse(inputText);
      } catch {
        toast.error("Input is not valid JSON");
        setRunState("idle");
        return;
      }
      const r = await request<InvokeResponse>(`/api/functions/${fn.id}/invoke`, {
        method: "POST",
        body: JSON.stringify(input),
      });
      setResult(r);
      setRunState(r.status === "success" ? "success" : "error");
    } catch (e) {
      setRunState("error");
      toast.error(String(e));
    }
  }

  if (!fn) return <div className="text-zinc-500">Loading…</div>;

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col gap-4">
      <div className="flex items-center gap-3">
        <Link to="/functions" className="text-zinc-500 hover:text-zinc-300">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <input
          value={fn.name}
          onChange={(e) => {
            setFn({ ...fn, name: e.target.value });
            setDirty(true);
          }}
          className="border-none bg-transparent text-xl font-semibold text-zinc-50 focus:outline-none focus:ring-0"
        />
        <div className="flex-1" />
        {dirty && <span className="text-xs text-amber-400">Unsaved</span>}
        <Button variant="outline" onClick={save} disabled={!dirty}>Save</Button>
        <RunButton
          state={runState}
          duration={result?.duration_ms}
          onClick={run}
          disabled={runState === "running"}
        />
        <Button variant="ghost" onClick={remove} className="text-zinc-500 hover:text-red-400">
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid flex-1 grid-cols-[3fr_2fr] gap-4 overflow-hidden">
        <div className="overflow-hidden rounded-lg border border-white/5 bg-zinc-950">
          <Editor
            height="100%"
            defaultLanguage="javascript"
            theme="vs-dark"
            value={fn.code}
            onChange={(v) => {
              setFn({ ...fn, code: v ?? "" });
              setDirty(true);
            }}
            options={{
              fontSize: 13,
              minimap: { enabled: false },
              fontFamily: "JetBrains Mono, ui-monospace, monospace",
            }}
          />
        </div>

        <div className="flex flex-col overflow-hidden rounded-lg border border-white/5 bg-zinc-900/40">
          <Tabs defaultValue="input" className="flex flex-1 flex-col">
            <TabsList className="m-2">
              <TabsTrigger value="input">Input</TabsTrigger>
              <TabsTrigger value="output">Output</TabsTrigger>
              <TabsTrigger value="logs">Logs</TabsTrigger>
              <TabsTrigger value="info">Info</TabsTrigger>
            </TabsList>
            <TabsContent value="input" className="flex-1 p-3 pt-0">
              <textarea
                className="h-full w-full resize-none rounded-md border border-white/5 bg-zinc-950 p-3 font-mono text-xs text-zinc-200 focus:outline-none"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
              />
            </TabsContent>
            <TabsContent value="output" className="flex-1 overflow-auto p-3 pt-0">
              {result ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs">
                    <StatusDot status={result.status} />
                    <span className="text-zinc-400">{result.status}</span>
                    <span className="text-zinc-600">•</span>
                    <span className="font-mono text-zinc-500">{result.duration_ms}ms</span>
                  </div>
                  <pre className="rounded-md border border-white/5 bg-zinc-950 p-3 font-mono text-xs text-zinc-200">
                    {result.status === "success"
                      ? JSON.stringify(result.output, null, 2)
                      : result.error}
                  </pre>
                </div>
              ) : (
                <div className="pt-8 text-center text-sm text-zinc-600">Run the function to see output</div>
              )}
            </TabsContent>
            <TabsContent value="logs" className="flex-1 overflow-auto p-3 pt-0">
              <pre className="h-full rounded-md border border-white/5 bg-zinc-950 p-3 font-mono text-xs text-zinc-300">
                {(result?.logs ?? []).join("\n") || "No logs yet."}
              </pre>
            </TabsContent>
            <TabsContent value="info" className="flex-1 p-3 pt-0 text-xs text-zinc-400">
              <div className="space-y-3 rounded-md border border-white/5 bg-zinc-950 p-3">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-zinc-600">Function ID</div>
                  <div className="font-mono text-zinc-200">{fn.id}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-zinc-600">Invoke URL</div>
                  <div className="break-all font-mono text-zinc-200">
                    {import.meta.env.VITE_API_URL}/api/invoke/{fn.id}
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
```

---

## Task 9: Web — Create RunsPage

**Files:**
- Create: `apps/web/src/pages/RunsPage.tsx`

- [ ] **Step 1: Implement page**

```tsx
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useApi } from "../lib/api";
import { StatusDot } from "@/components/StatusDot";
import { EmptyState } from "@/components/EmptyState";
import { History } from "lucide-react";

type Status = "success" | "error" | "timeout";

interface Run {
  id: string;
  function_id: string;
  function_name: string | null;
  source: "ui" | "api";
  status: Status;
  duration_ms: number;
  started_at: string;
}

const FILTERS: { label: string; value: "all" | Status }[] = [
  { label: "All", value: "all" },
  { label: "Success", value: "success" },
  { label: "Error", value: "error" },
  { label: "Timeout", value: "timeout" },
];

export default function RunsPage() {
  const { request } = useApi();
  const [runs, setRuns] = useState<Run[]>([]);
  const [filter, setFilter] = useState<"all" | Status>("all");

  useEffect(() => {
    const qs = filter === "all" ? "?limit=200" : `?limit=200&status=${filter}`;
    request<{ invocations: Run[] }>(`/api/invocations${qs}`).then((r) => setRuns(r.invocations));
  }, [filter]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-50">Runs</h1>
        <p className="text-sm text-zinc-500">Execution history across all functions.</p>
      </div>

      <div className="flex items-center gap-1 rounded-md border border-white/5 bg-zinc-900/40 p-1">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={
              filter === f.value
                ? "rounded px-3 py-1 text-xs text-zinc-50 bg-white/10"
                : "rounded px-3 py-1 text-xs text-zinc-400 hover:text-zinc-200"
            }
          >
            {f.label}
          </button>
        ))}
      </div>

      {runs.length === 0 ? (
        <EmptyState
          icon={<History className="h-8 w-8" />}
          title="No runs yet"
          body="Execution history will appear here once you invoke a function."
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-white/5 bg-zinc-900/40">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/5 text-left text-xs uppercase tracking-wider text-zinc-500">
                <th className="px-4 py-3 font-medium">Function</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Duration</th>
                <th className="px-4 py-3 font-medium">Source</th>
                <th className="px-4 py-3 font-medium">When</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className="border-b border-white/5 last:border-0 hover:bg-white/5">
                  <td className="px-4 py-3">
                    <Link
                      to={`/functions/${r.function_id}`}
                      className="font-medium text-zinc-100 hover:text-violet-300"
                    >
                      {r.function_name ?? r.function_id.slice(0, 8)}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <StatusDot status={r.status} />
                      <span className="text-sm text-zinc-400">{r.status}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-zinc-400">{r.duration_ms}ms</td>
                  <td className="px-4 py-3 text-xs text-zinc-500">{r.source}</td>
                  <td className="px-4 py-3 text-xs text-zinc-500">
                    {new Date(r.started_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

---

## Task 10: Web — Split API Keys into its own page + trim SettingsPage

**Files:**
- Create: `apps/web/src/pages/ApiKeysPage.tsx`
- Modify: `apps/web/src/pages/SettingsPage.tsx`

- [ ] **Step 1: Create `ApiKeysPage.tsx`**

```tsx
import { useEffect, useState } from "react";
import { Plus, Copy, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useApi } from "../lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/EmptyState";
import { KeyRound } from "lucide-react";

interface Key {
  id: string;
  name: string;
  prefix: string;
  last_used_at: string | null;
  created_at: string;
}

export default function ApiKeysPage() {
  const { request } = useApi();
  const [keys, setKeys] = useState<Key[]>([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [rawKey, setRawKey] = useState<string | null>(null);

  async function load() {
    const r = await request<{ keys: Key[] }>("/api/keys");
    setKeys(r.keys);
  }
  useEffect(() => {
    load();
  }, []);

  async function create() {
    const r = await request<{ key: Key; raw_key: string }>("/api/keys", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
    setRawKey(r.raw_key);
    setName("");
    load();
  }

  async function remove(id: string) {
    if (!confirm("Delete this key?")) return;
    await request(`/api/keys/${id}`, { method: "DELETE" });
    toast.success("Key revoked");
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-50">API Keys</h1>
          <p className="text-sm text-zinc-500">Manage keys for programmatic access.</p>
        </div>
        <Dialog
          open={open}
          onOpenChange={(v) => {
            setOpen(v);
            if (!v) setRawKey(null);
          }}
        >
          <DialogTrigger asChild>
            <Button className="bg-violet-500 text-white hover:bg-violet-400">
              <Plus className="mr-1 h-4 w-4" /> New key
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{rawKey ? "Your new key" : "New API key"}</DialogTitle>
            </DialogHeader>
            {rawKey ? (
              <div className="space-y-2">
                <p className="text-sm text-amber-400">Copy this now. It won't be shown again.</p>
                <code className="block rounded-md border border-white/5 bg-zinc-950 p-3 font-mono text-xs text-zinc-200 break-all">
                  {rawKey}
                </code>
                <Button
                  onClick={() => {
                    navigator.clipboard.writeText(rawKey);
                    toast.success("Copied to clipboard");
                  }}
                >
                  <Copy className="mr-1 h-4 w-4" /> Copy
                </Button>
              </div>
            ) : (
              <>
                <Input
                  placeholder="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                <DialogFooter>
                  <Button onClick={create} disabled={!name}>Create</Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {keys.length === 0 ? (
        <EmptyState
          icon={<KeyRound className="h-8 w-8" />}
          title="No API keys yet"
          body="Create a key to invoke your functions from other services."
        />
      ) : (
        <div className="space-y-2">
          {keys.map((k) => (
            <div
              key={k.id}
              className="flex items-center justify-between rounded-lg border border-white/5 bg-zinc-900/40 p-4"
            >
              <div className="flex-1">
                <div className="font-medium text-zinc-100">{k.name}</div>
                <div className="mt-1 flex items-center gap-3 text-xs text-zinc-500">
                  <code className="font-mono">{k.prefix}…</code>
                  <span>
                    Last used:{" "}
                    {k.last_used_at ? new Date(k.last_used_at).toLocaleString() : "never"}
                  </span>
                  <span>Created: {new Date(k.created_at).toLocaleDateString()}</span>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => remove(k.id)}
                className="text-zinc-500 hover:text-red-400"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-lg border border-white/5 bg-zinc-900/40 p-5">
        <h2 className="mb-2 text-sm font-semibold text-zinc-200">Using the API</h2>
        <pre className="overflow-auto rounded-md border border-white/5 bg-zinc-950 p-3 font-mono text-xs text-zinc-300">
{`curl -X POST ${import.meta.env.VITE_API_URL}/api/invoke/<FUNCTION_ID> \\
  -H "Authorization: Bearer nvk_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{"name":"world"}'`}
        </pre>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Rewrite `SettingsPage.tsx`**

```tsx
import { useUser } from "@clerk/clerk-react";

export default function SettingsPage() {
  const { user } = useUser();

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-50">Settings</h1>
        <p className="text-sm text-zinc-500">Your account and preferences.</p>
      </div>

      <section className="space-y-3 rounded-lg border border-white/5 bg-zinc-900/40 p-6">
        <h2 className="text-sm font-semibold text-zinc-200">Profile</h2>
        <div className="grid grid-cols-[120px_1fr] gap-y-2 text-sm">
          <div className="text-zinc-500">Name</div>
          <div className="text-zinc-200">{user?.fullName ?? "—"}</div>
          <div className="text-zinc-500">Email</div>
          <div className="text-zinc-200">{user?.primaryEmailAddress?.emailAddress ?? "—"}</div>
        </div>
      </section>

      <section className="space-y-3 rounded-lg border border-white/5 bg-zinc-900/40 p-6">
        <h2 className="text-sm font-semibold text-zinc-200">Appearance</h2>
        <p className="text-sm text-zinc-500">
          Theme: Dark. <span className="text-zinc-600">(Light mode coming soon.)</span>
        </p>
      </section>

      <section className="space-y-3 rounded-lg border border-red-500/20 bg-red-500/5 p-6">
        <h2 className="text-sm font-semibold text-red-400">Danger zone</h2>
        <p className="text-sm text-zinc-400">
          Account deletion is handled through your Clerk account profile.
        </p>
      </section>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npm -w apps/web run typecheck`
Expected: no errors.

- [ ] **Step 4: Build**

Run: `npm -w apps/web run build`
Expected: successful build output in `apps/web/dist`.

---

## Task 11: Manual verification

- [ ] **Step 1: Start API**

Run: `npm run dev:api`
Expected: API listening on port 8080.

- [ ] **Step 2: Start web dev server**

In another shell: `npm run dev:web`
Expected: Vite dev server on http://localhost:5173.

- [ ] **Step 3: Smoke test UI**

In a browser:
- Sign in, confirm sidebar appears with Functions / Runs / API Keys / Settings nav.
- Functions list renders with empty state, create a function, confirm redirect.
- Function detail: edit, Save (toast), Run (button morphs to success pill).
- Runs page shows the new run.
- API Keys page: create key, confirm full-key modal + copy toast, revoke.
- Settings page shows three sections.
- Cmd-K opens palette, searching a function navigates to it.
- User block at bottom of sidebar: click opens popover with Sign out.

---
