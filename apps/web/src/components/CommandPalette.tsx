import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import { useApi, type Fn } from "@/lib/api";

interface CmdItem {
  id: string;
  label: string;
  hint?: string;
  action: () => void;
}

export function CommandPalette() {
  const nav = useNavigate();
  const { request } = useApi();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [fns, setFns] = useState<Pick<Fn, "id" | "name">[]>([]);
  const [selected, setSelected] = useState(0);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((x) => !x);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSelected(0);
    request<{ functions: Fn[] }>("/api/functions")
      .then((r) => setFns(r.functions.map((f) => ({ id: f.id, name: f.name }))))
      .catch(() => {});
  }, [open]);

  const items = useMemo<CmdItem[]>(() => {
    const base: CmdItem[] = [
      { id: "nav-functions", label: "Go to Functions", hint: "Nav", action: () => nav("/functions") },
      { id: "nav-runs", label: "Go to Runs", hint: "Nav", action: () => nav("/runs") },
      { id: "nav-keys", label: "Go to API keys", hint: "Nav", action: () => nav("/keys") },
      { id: "nav-settings", label: "Go to Settings", hint: "Nav", action: () => nav("/settings") },
    ];
    const fnItems: CmdItem[] = fns.map((f) => ({
      id: `fn-${f.id}`,
      label: f.name,
      hint: "Function",
      action: () => nav(`/functions/${f.id}`),
    }));
    const all = [...base, ...fnItems];
    if (!query.trim()) return all;
    const q = query.toLowerCase();
    return all.filter((i) => i.label.toLowerCase().includes(q));
  }, [fns, query, nav]);

  useEffect(() => {
    setSelected(0);
  }, [query]);

  if (!open) return null;

  function go(item: CmdItem) {
    item.action();
    setOpen(false);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-background/70 pt-24 backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-lg border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command or function..."
            className="flex-1 bg-transparent text-sm text-foreground outline-none"
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setSelected((s) => Math.min(items.length - 1, s + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setSelected((s) => Math.max(0, s - 1));
              } else if (e.key === "Enter") {
                e.preventDefault();
                const it = items[selected];
                if (it) go(it);
              }
            }}
          />
        </div>
        <div className="max-h-80 overflow-auto py-1">
          {items.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">No results</div>
          ) : (
            items.map((it, idx) => (
              <button
                key={it.id}
                type="button"
                className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm ${
                  idx === selected
                    ? "bg-accent text-accent-foreground"
                    : "text-foreground hover:bg-accent/50"
                }`}
                onMouseEnter={() => setSelected(idx)}
                onClick={() => go(it)}
              >
                <span className="truncate">{it.label}</span>
                {it.hint && (
                  <span className="ml-2 shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground">
                    {it.hint}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
