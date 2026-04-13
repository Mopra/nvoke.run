import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useApi } from "../lib/api";
import { Search } from "lucide-react";

interface Fn {
  id: string;
  name: string;
}

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

  const filtered = actions.filter((a) =>
    a.label.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-lg p-0">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search functions, jump to page…"
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          <kbd className="rounded bg-accent px-1.5 py-0.5 text-[10px] text-muted-foreground">
            ESC
          </kbd>
        </div>
        <div className="max-h-80 overflow-auto p-1">
          {filtered.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">No results</div>
          ) : (
            filtered.map((a) => (
              <button
                key={a.id}
                onClick={() => {
                  a.run();
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm text-foreground hover:bg-accent hover:text-accent-foreground"
              >
                <span>{a.label}</span>
                {a.hint && <span className="text-xs text-muted-foreground">{a.hint}</span>}
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
