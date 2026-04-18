import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Activity, RefreshCw } from "lucide-react";
import { useApi, type TriggerEvent, type TriggerEventKind } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState";

const KIND_LABELS: Record<TriggerEventKind, string> = {
  schedule_fired: "Schedule fired",
  schedule_skipped: "Schedule skipped",
  schedule_error: "Schedule error",
  webhook_received: "Webhook verified",
  webhook_rejected: "Webhook rejected",
};

function relTime(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function TriggerEventsPanel({ functionId }: { functionId: string }) {
  const { request } = useApi();
  const nav = useNavigate();
  const [events, setEvents] = useState<TriggerEvent[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const r = await request<{ events: TriggerEvent[] }>(
        `/api/functions/${functionId}/trigger-events?limit=100`,
      );
      setEvents(r.events);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [functionId]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Trigger events
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Audit log of fires, skips, and verification failures for schedules and
            webhooks.
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-8"
          onClick={() => void load()}
          disabled={loading}
        >
          <RefreshCw className="mr-1 h-3.5 w-3.5" /> Refresh
        </Button>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : events.length === 0 ? (
        <EmptyState
          icon={<Activity className="h-6 w-6" />}
          title="No trigger events yet"
          body="Schedule fires and webhook deliveries will show up here as they happen."
        />
      ) : (
        <div className="divide-y divide-border rounded border border-border bg-card">
          {events.map((e) => (
            <div
              key={e.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm"
            >
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${
                  e.outcome === "ok" ? "bg-primary" : "bg-destructive"
                }`}
                aria-hidden="true"
              />
              <span className="font-medium text-foreground">
                {KIND_LABELS[e.kind] ?? e.kind}
              </span>
              <span className="font-mono text-xs text-muted-foreground">
                {relTime(e.created_at)}
              </span>
              {e.message && (
                <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                  {e.message}
                </span>
              )}
              {e.invocation_id && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2"
                  onClick={() => nav(`/runs/${e.invocation_id}`)}
                >
                  Open run
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
