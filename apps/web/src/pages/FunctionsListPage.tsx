import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, MoreHorizontal, Code2 } from "lucide-react";
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
                <Button onClick={() => setOpen(true)}>
                  <Plus className="mr-1 h-4 w-4" /> Create your first function
                </Button>
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
                      <MoreHorizontal className="inline h-4 w-4 text-muted-foreground/70" />
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
