import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { History } from "lucide-react";
import { useApi } from "../lib/api";
import { StatusDot } from "@/components/StatusDot";
import { EmptyState } from "@/components/EmptyState";
import { FilterTabs, type FilterTab } from "@/components/FilterTabs";

type Status = "success" | "error" | "timeout";

interface Run {
  id: string;
  function_id: string;
  function_name: string | null;
  source: "ui" | "api";
  status: Status;
  duration_ms: number;
  started_at: string;
  trigger_kind: "editor" | "http";
  request_method: string | null;
  response_status: number | null;
}

const FILTERS: readonly FilterTab<"all" | Status>[] = [
  { label: "All", value: "all" },
  { label: "Success", value: "success" },
  { label: "Error", value: "error" },
  { label: "Timeout", value: "timeout" },
];

export default function RunsPage() {
  const { request } = useApi();
  const nav = useNavigate();
  const [runs, setRuns] = useState<Run[]>([]);
  const [filter, setFilter] = useState<"all" | Status>("all");

  useEffect(() => {
    const qs = filter === "all" ? "?limit=200" : `?limit=200&status=${filter}`;
    request<{ invocations: Run[] }>(`/api/invocations${qs}`).then((r) =>
      setRuns(r.invocations),
    );
  }, [filter]);

  return (
    <div className="flex h-full flex-col bg-card text-card-foreground">
      {/* Toolbar */}
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border bg-muted/30 px-3">
        <div className="text-sm font-semibold text-foreground">Runs</div>
        <span className="text-muted-foreground/50">•</span>
        <div className="text-xs text-muted-foreground">
          Execution history across all functions.
        </div>
      </div>

      {/* Filter strip */}
      <div className="flex h-9 shrink-0 items-center border-b border-border bg-muted/20 px-3">
        <FilterTabs tabs={FILTERS} value={filter} onChange={setFilter} />
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-auto">
        {runs.length === 0 ? (
          <div className="flex h-full items-center justify-center p-8">
            <EmptyState
              icon={<History className="h-8 w-8" />}
              title="No runs yet"
              body="Execution history will appear here once you invoke a function."
            />
          </div>
        ) : (
          <table className="w-full">
            <thead className="sticky top-0 z-10 bg-card">
              <tr className="border-b border-border text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2 font-medium">Function</th>
                <th className="px-4 py-2 font-medium">Trigger</th>
                <th className="px-4 py-2 font-medium">Method</th>
                <th className="px-4 py-2 font-medium">HTTP</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Duration</th>
                <th className="px-4 py-2 font-medium">When</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => nav(`/runs/${r.id}`)}
                  className="cursor-pointer border-b border-border hover:bg-accent/50"
                >
                  <td className="px-4 py-3">
                    <Link
                      to={`/functions/${r.function_id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="font-medium text-foreground hover:text-primary"
                    >
                      {r.function_name ?? r.function_id.slice(0, 8)}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">
                      {r.trigger_kind}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {r.request_method ?? "-"}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {r.response_status ?? "-"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <StatusDot status={r.status} />
                      <span className="text-sm text-muted-foreground">{r.status}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {r.duration_ms}ms
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {new Date(r.started_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
