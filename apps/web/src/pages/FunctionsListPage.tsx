import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, MoreHorizontal, Code2 } from "lucide-react";
import { toast } from "sonner";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { StatusDot } from "@/components/StatusDot";
import { Sparkline } from "@/components/Sparkline";
import { EmptyState } from "@/components/EmptyState";
import { useConfirm } from "@/components/ConfirmDialog";

interface Fn {
  id: string;
  name: string;
  code?: string;
  created_at: string;
}

interface Invocation {
  id: string;
  function_id: string;
  status: "success" | "error" | "timeout";
  started_at: string;
}

interface InvokeResponse {
  invocation_id: string;
  status: "success" | "error" | "timeout";
  output: unknown;
  logs: string[] | null;
  error: string | null;
  duration_ms: number;
}

const DEFAULT_CODE = `export default async function (input, ctx) {
  ctx.log("hello", input);
  return { echo: input };
}
`;

const DEFAULT_INPUT = {
  name: "world",
};

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
  const confirm = useConfirm();
  const [fns, setFns] = useState<Fn[]>([]);
  const [invs, setInvs] = useState<Invocation[]>([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [renameTarget, setRenameTarget] = useState<Fn | null>(null);
  const [renameName, setRenameName] = useState("");

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

  async function duplicateFunction(id: string) {
    const detail = await request<{ function: Fn }>(`/api/functions/${id}`);
    const res = await request<{ function: Fn }>("/api/functions", {
      method: "POST",
      body: JSON.stringify({
        name: `${detail.function.name} copy`,
        code: detail.function.code ?? DEFAULT_CODE,
      }),
    });
    toast.success("Function duplicated");
    nav(`/functions/${res.function.id}`);
  }

  async function renameFunction() {
    if (!renameTarget) return;
    const nextName = renameName.trim();
    if (!nextName || nextName === renameTarget.name) {
      setRenameTarget(null);
      setRenameName("");
      return;
    }
    const res = await request<{ function: Fn }>(`/api/functions/${renameTarget.id}`, {
      method: "PUT",
      body: JSON.stringify({ name: nextName }),
    });
    setFns((current) =>
      current.map((fn) =>
        fn.id === renameTarget.id ? { ...fn, name: res.function.name } : fn,
      ),
    );
    setRenameTarget(null);
    setRenameName("");
    toast.success("Function renamed");
  }

  async function runFunction(id: string) {
    const res = await request<InvokeResponse>(`/api/functions/${id}/invoke`, {
      method: "POST",
      body: JSON.stringify(DEFAULT_INPUT),
    });
    const runsRes = await request<{ invocations: Invocation[] }>("/api/invocations?limit=500");
    setInvs(runsRes.invocations);
    if (res.status === "success") {
      toast.success(`Run finished in ${res.duration_ms}ms`);
      return;
    }
    toast.error(res.error ?? `Run ${res.status}`);
  }

  function copyInvokeUrl(id: string) {
    navigator.clipboard.writeText(`${import.meta.env.VITE_API_URL}/api/invoke/${id}`);
    toast.success("Invoke URL copied");
  }

  function copyCurl(id: string) {
    navigator.clipboard.writeText(
      `curl -X POST ${import.meta.env.VITE_API_URL}/api/invoke/${id} \\
  -H "Authorization: Bearer nvk_your_key" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(DEFAULT_INPUT)}'`,
    );
    toast.success("Curl command copied");
  }

  async function deleteFunction(id: string) {
    const fn = fns.find((f) => f.id === id);
    const ok = await confirm({
      title: "Delete this function?",
      description: fn ? `"${fn.name}" will be permanently removed along with its invocation history.` : undefined,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    await request(`/api/functions/${id}`, { method: "DELETE" });
    setFns((current) => current.filter((fn) => fn.id !== id));
    setInvs((current) => current.filter((inv) => inv.function_id !== id));
    toast.success("Function deleted");
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

  return (
    <div className="flex h-full flex-col bg-card text-card-foreground">
      {/* Toolbar */}
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border bg-muted/30 px-3">
        <div className="text-sm font-semibold text-foreground">Functions</div>
        <span className="text-muted-foreground/50">•</span>
        <div className="text-xs text-muted-foreground">
          Write, run, and manage small Node.js functions.
        </div>
        <div className="flex-1" />
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="h-7">
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
              <Button onClick={create} disabled={!name}>
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Dialog
          open={renameTarget !== null}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) {
              setRenameTarget(null);
              setRenameName("");
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Rename function</DialogTitle>
            </DialogHeader>
            <Input
              placeholder="name"
              value={renameName}
              onChange={(e) => setRenameName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void renameFunction();
                }
              }}
            />
            <DialogFooter>
              <Button variant="ghost" onClick={() => setRenameTarget(null)}>
                Cancel
              </Button>
              <Button onClick={() => void renameFunction()} disabled={!renameName.trim()}>
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-auto">
        {fns.length === 0 ? (
          <div className="flex h-full items-center justify-center p-8">
            <EmptyState
              icon={<Code2 className="h-8 w-8" />}
              title="No functions yet"
              body="Create your first function to start writing and running Node.js code in the cloud."
              action={
                <div className="flex flex-col items-center gap-2">
                  <Button onClick={() => setOpen(true)}>
                    <Plus className="mr-1 h-4 w-4" /> Create your first function
                  </Button>
                  <a
                    href="https://docs.nvoke.run/guides/writing-functions"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    Learn more →
                  </a>
                </div>
              }
            />
          </div>
        ) : (
          <table className="w-full">
            <thead className="sticky top-0 z-10 bg-card">
              <tr className="border-b border-border text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Last run</th>
                <th className="px-4 py-2 font-medium">Invocations (7d)</th>
                <th className="px-4 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {fns.map((f) => {
                const { last, sparkline } = statsFor(f.id);
                return (
                  <tr
                    key={f.id}
                    onClick={() => nav(`/functions/${f.id}`)}
                    className="cursor-pointer border-b border-border transition-colors hover:bg-accent/50"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <StatusDot status={last ? last.status : "idle"} />
                        <span className="font-medium text-foreground">{f.name}</span>
                      </div>
                      <div className="mt-0.5 font-mono text-[10px] text-muted-foreground/70">
                        {f.id.slice(0, 8)}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {last ? relTime(last.started_at) : "Never"}
                    </td>
                    <td className="px-4 py-3">
                      <Sparkline values={sparkline} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Popover>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            aria-label={`Actions for ${f.name}`}
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground/70 hover:bg-accent hover:text-foreground"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent
                          align="end"
                          className="w-44 p-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            className="flex w-full cursor-pointer items-center rounded-md px-3 py-2 text-left text-sm text-foreground hover:bg-accent"
                            onClick={() => {
                              setRenameTarget(f);
                              setRenameName(f.name);
                            }}
                          >
                            Rename
                          </button>
                          <button
                            type="button"
                            className="flex w-full cursor-pointer items-center rounded-md px-3 py-2 text-left text-sm text-foreground hover:bg-accent"
                            onClick={() => void runFunction(f.id)}
                          >
                            Run now
                          </button>
                          <button
                            type="button"
                            className="flex w-full cursor-pointer items-center rounded-md px-3 py-2 text-left text-sm text-foreground hover:bg-accent"
                            onClick={() => copyInvokeUrl(f.id)}
                          >
                            Copy invoke URL
                          </button>
                          <button
                            type="button"
                            className="flex w-full cursor-pointer items-center rounded-md px-3 py-2 text-left text-sm text-foreground hover:bg-accent"
                            onClick={() => copyCurl(f.id)}
                          >
                            Copy curl
                          </button>
                          <div className="my-1 h-px w-full bg-border" aria-hidden />
                          <button
                            type="button"
                            className="flex w-full cursor-pointer items-center rounded-md px-3 py-2 text-left text-sm text-foreground hover:bg-accent"
                            onClick={() => void duplicateFunction(f.id)}
                          >
                            Duplicate
                          </button>
                          <button
                            type="button"
                            className="flex w-full cursor-pointer items-center rounded-md px-3 py-2 text-left text-sm text-destructive hover:bg-accent"
                            onClick={() => void deleteFunction(f.id)}
                          >
                            Delete
                          </button>
                        </PopoverContent>
                      </Popover>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
