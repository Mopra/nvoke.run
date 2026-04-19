import { useEffect, useMemo, useState } from "react";
import {
  CalendarClock,
  Pencil,
  Play,
  Plus,
  Power,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  ApiError,
  SUPPORTED_METHODS,
  useApi,
  type HttpMethod,
  type Schedule,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/EmptyState";
import { useConfirm } from "@/components/ConfirmDialog";

interface DraftState {
  id: string | null;
  name: string;
  cron_expression: string;
  timezone: string;
  request_method: HttpMethod;
  request_headers: string;
  request_body: string;
  enabled: boolean;
}

const EMPTY_DRAFT: DraftState = {
  id: null,
  name: "",
  cron_expression: "0 * * * *",
  timezone:
    typeof Intl !== "undefined"
      ? Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
      : "UTC",
  request_method: "POST",
  request_headers: '{\n  "content-type": "application/json"\n}',
  request_body: "",
  enabled: true,
};

const CRON_PRESETS: Array<{ label: string; value: string }> = [
  { label: "Every minute", value: "* * * * *" },
  { label: "Every 5 min", value: "*/5 * * * *" },
  { label: "Hourly (:00)", value: "0 * * * *" },
  { label: "Daily (00:00 UTC)", value: "0 0 * * *" },
  { label: "Weekdays 09:00", value: "0 9 * * 1-5" },
];

function relTime(iso: string | null): string {
  if (!iso) return "—";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  const abs = Math.abs(diff);
  const suffix = diff >= 0 ? "ago" : "from now";
  if (abs < 60) return `${Math.floor(abs)}s ${suffix}`;
  if (abs < 3600) return `${Math.floor(abs / 60)}m ${suffix}`;
  if (abs < 86400) return `${Math.floor(abs / 3600)}h ${suffix}`;
  return `${Math.floor(abs / 86400)}d ${suffix}`;
}

function absTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

interface ScheduleRunResult {
  id: string;
  status: "success" | "error" | "timeout";
  duration_ms: number;
  output: unknown;
  logs: string[] | null;
  error_message: string | null;
  response_status: number | null;
}

export function SchedulesPanel({ functionId }: { functionId: string }) {
  const { request } = useApi();
  const confirm = useConfirm();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastRuns, setLastRuns] = useState<Record<string, ScheduleRunResult>>(
    {},
  );

  async function load() {
    setLoading(true);
    try {
      const r = await request<{ schedules: Schedule[] }>(
        `/api/functions/${functionId}/schedules`,
      );
      setSchedules(r.schedules);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [functionId]);

  function openCreate() {
    setDraft({ ...EMPTY_DRAFT });
  }

  function openEdit(s: Schedule) {
    setDraft({
      id: s.id,
      name: s.name,
      cron_expression: s.cron_expression,
      timezone: s.timezone,
      request_method: s.request_method,
      request_headers:
        Object.keys(s.request_headers ?? {}).length > 0
          ? JSON.stringify(s.request_headers, null, 2)
          : EMPTY_DRAFT.request_headers,
      request_body: s.request_body ?? "",
      enabled: s.enabled,
    });
  }

  function closeDraft() {
    setDraft(null);
  }

  async function submit() {
    if (!draft) return;
    let headers: Record<string, string>;
    try {
      const parsed = draft.request_headers.trim()
        ? JSON.parse(draft.request_headers)
        : {};
      if (typeof parsed !== "object" || Array.isArray(parsed) || !parsed) {
        throw new Error("must be a JSON object");
      }
      headers = Object.fromEntries(
        Object.entries(parsed).map(([k, v]) => [k, String(v)]),
      );
    } catch (e) {
      toast.error(
        `Headers: ${e instanceof Error ? e.message : "invalid JSON"}`,
      );
      return;
    }
    const payload = {
      name: draft.name.trim(),
      cron_expression: draft.cron_expression.trim(),
      timezone: draft.timezone.trim() || "UTC",
      request_method: draft.request_method,
      request_headers: headers,
      request_body: draft.request_body.length === 0 ? null : draft.request_body,
      enabled: draft.enabled,
    };
    if (!payload.name) {
      toast.error("Name is required");
      return;
    }
    if (!payload.cron_expression) {
      toast.error("Cron expression is required");
      return;
    }
    setBusy(true);
    try {
      if (draft.id) {
        await request(`/api/schedules/${draft.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        toast.success("Schedule updated");
      } else {
        await request(`/api/functions/${functionId}/schedules`, {
          method: "POST",
          body: JSON.stringify(payload),
        });
        toast.success("Schedule created");
      }
      closeDraft();
      await load();
    } catch (e) {
      if (e instanceof ApiError && e.code === "invalid_cron") {
        toast.error(`Invalid cron: ${e.message}`);
      } else {
        toast.error(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setBusy(false);
    }
  }

  async function toggleEnabled(s: Schedule) {
    setBusy(true);
    try {
      await request(`/api/schedules/${s.id}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled: !s.enabled }),
      });
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove(s: Schedule) {
    const ok = await confirm({
      title: `Delete "${s.name}"?`,
      description: "This schedule will stop firing immediately.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    await request(`/api/schedules/${s.id}`, { method: "DELETE" });
    toast.success("Schedule deleted");
    await load();
  }

  async function runNow(s: Schedule) {
    setBusy(true);
    try {
      const r = await request<{
        schedule: Schedule;
        invocation: ScheduleRunResult | null;
      }>(`/api/schedules/${s.id}/run`, { method: "POST" });
      if (r.invocation) {
        setLastRuns((prev) => ({ ...prev, [s.id]: r.invocation! }));
        if (r.invocation.status === "success") {
          toast.success("Schedule fired");
        } else {
          toast.error(
            r.invocation.error_message ??
              `Schedule ran with status: ${r.invocation.status}`,
          );
        }
      } else {
        toast.warning("Schedule fired but was skipped (disabled or gated)");
      }
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function dismissLastRun(scheduleId: string) {
    setLastRuns((prev) => {
      const { [scheduleId]: _drop, ...rest } = prev;
      return rest;
    });
  }

  const sorted = useMemo(
    () =>
      [...schedules].sort((a, b) => {
        if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
        const an = a.next_run_at ? new Date(a.next_run_at).getTime() : Infinity;
        const bn = b.next_run_at ? new Date(b.next_run_at).getTime() : Infinity;
        return an - bn;
      }),
    [schedules],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Scheduled invocations
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Runs on a cron schedule. Billing and secrets apply as with HTTP calls.
          </p>
        </div>
        {!draft && (
          <Button size="sm" className="h-8" onClick={openCreate}>
            <Plus className="mr-1 h-4 w-4" /> New schedule
          </Button>
        )}
      </div>

      {draft && (
        <DraftEditor
          draft={draft}
          setDraft={setDraft}
          onCancel={closeDraft}
          onSubmit={submit}
          busy={busy}
        />
      )}

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : sorted.length === 0 && !draft ? (
        <EmptyState
          icon={<CalendarClock className="h-6 w-6" />}
          title="No schedules yet"
          body="Create one to run this function automatically on a cron schedule."
        />
      ) : (
        <div className="divide-y divide-border rounded border border-border bg-card">
          {sorted.map((s) => (
            <div key={s.id} className="flex flex-col gap-2 px-3 py-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <CalendarClock
                  className={`h-3.5 w-3.5 shrink-0 ${
                    s.enabled ? "text-primary" : "text-muted-foreground"
                  }`}
                />
                <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                  {s.name}
                </span>
                <span className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[11px] text-secondary-foreground">
                  {s.request_method}
                </span>
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                  {s.cron_expression}
                </code>
                {!s.enabled && (
                  <span className="rounded bg-destructive/20 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-destructive">
                    Disabled
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span title="Timezone">{s.timezone}</span>
                <span title={absTime(s.next_run_at)}>
                  Next: {s.enabled ? relTime(s.next_run_at) : "—"}
                </span>
                <span title={absTime(s.last_run_at)}>
                  Last: {relTime(s.last_run_at)}
                  {s.last_run_status ? ` (${s.last_run_status})` : ""}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2"
                  onClick={() => void runNow(s)}
                  disabled={busy}
                >
                  <Play className="mr-1 h-3.5 w-3.5" /> Run now
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2"
                  onClick={() => void toggleEnabled(s)}
                  disabled={busy}
                >
                  <Power className="mr-1 h-3.5 w-3.5" />{" "}
                  {s.enabled ? "Disable" : "Enable"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2"
                  onClick={() => openEdit(s)}
                >
                  <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                  onClick={() => void remove(s)}
                  title="Delete"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              {lastRuns[s.id] && (
                <LastRunPanel
                  result={lastRuns[s.id]!}
                  onDismiss={() => dismissLastRun(s.id)}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatOutput(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function LastRunPanel({
  result,
  onDismiss,
}: {
  result: ScheduleRunResult;
  onDismiss: () => void;
}) {
  const statusClass =
    result.status === "success"
      ? "bg-primary/15 text-primary"
      : "bg-destructive/20 text-destructive";
  const body = formatOutput(result.output);
  const logs = result.logs ?? [];
  return (
    <div className="mt-2 rounded border border-border bg-muted/30 p-2 text-xs">
      <div className="mb-2 flex items-center gap-2">
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${statusClass}`}
        >
          {result.status}
        </span>
        <span className="font-mono text-[11px] text-muted-foreground">
          {result.duration_ms}ms
        </span>
        {result.response_status != null && (
          <span className="font-mono text-[11px] text-muted-foreground">
            HTTP {result.response_status}
          </span>
        )}
        <div className="ml-auto">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 text-muted-foreground"
            onClick={onDismiss}
            title="Dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      {result.error_message && (
        <pre className="mb-2 max-h-40 overflow-auto whitespace-pre-wrap rounded border border-destructive/30 bg-destructive/10 p-2 font-mono text-[11px] text-destructive">
          {result.error_message}
        </pre>
      )}
      {body && (
        <div>
          <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground/70">
            Output
          </div>
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded border border-border bg-background p-2 font-mono text-[11px]">
            {body}
          </pre>
        </div>
      )}
      {logs.length > 0 && (
        <div className="mt-2">
          <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground/70">
            Logs
          </div>
          <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded border border-border bg-background p-2 font-mono text-[11px] text-muted-foreground">
            {logs.join("\n")}
          </pre>
        </div>
      )}
    </div>
  );
}

interface DraftEditorProps {
  draft: DraftState;
  setDraft: (d: DraftState) => void;
  onCancel: () => void;
  onSubmit: () => void;
  busy: boolean;
}

function DraftEditor({
  draft,
  setDraft,
  onCancel,
  onSubmit,
  busy,
}: DraftEditorProps) {
  return (
    <div className="space-y-3 rounded border border-border bg-muted/30 p-4 text-xs">
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {draft.id ? "Edit schedule" : "New schedule"}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          onClick={onCancel}
          title="Cancel"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div>
        <label className="block text-[10px] uppercase tracking-wider text-muted-foreground/70">
          Name
        </label>
        <Input
          className="mt-1 h-8"
          placeholder="Nightly cleanup"
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          disabled={busy}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-muted-foreground/70">
            Cron expression
          </label>
          <Input
            className="mt-1 h-8 font-mono"
            placeholder="0 * * * *"
            value={draft.cron_expression}
            onChange={(e) =>
              setDraft({ ...draft, cron_expression: e.target.value })
            }
            disabled={busy}
          />
          <div className="mt-2 flex flex-wrap gap-1">
            {CRON_PRESETS.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => setDraft({ ...draft, cron_expression: p.value })}
                className="rounded border border-border bg-card px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-muted-foreground/70">
            Timezone (IANA)
          </label>
          <Input
            className="mt-1 h-8 font-mono"
            placeholder="UTC"
            value={draft.timezone}
            onChange={(e) => setDraft({ ...draft, timezone: e.target.value })}
            disabled={busy}
          />
        </div>
      </div>

      <div>
        <label className="block text-[10px] uppercase tracking-wider text-muted-foreground/70">
          Method
        </label>
        <div className="mt-1 flex flex-wrap gap-1">
          {SUPPORTED_METHODS.map((m) => {
            const on = draft.request_method === m;
            return (
              <button
                key={m}
                type="button"
                onClick={() => setDraft({ ...draft, request_method: m })}
                className={`rounded border px-2 py-1 font-mono text-[11px] ${
                  on
                    ? "border-primary bg-primary/15 text-foreground"
                    : "border-border bg-card text-muted-foreground hover:text-foreground"
                }`}
              >
                {m}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label className="block text-[10px] uppercase tracking-wider text-muted-foreground/70">
          Headers (JSON)
        </label>
        <textarea
          className="mt-1 h-20 w-full rounded border border-border bg-card px-2 py-1 font-mono text-xs text-foreground outline-none focus:border-primary"
          value={draft.request_headers}
          onChange={(e) =>
            setDraft({ ...draft, request_headers: e.target.value })
          }
          disabled={busy}
        />
      </div>

      <div>
        <label className="block text-[10px] uppercase tracking-wider text-muted-foreground/70">
          Body (raw)
        </label>
        <textarea
          className="mt-1 h-24 w-full rounded border border-border bg-card px-2 py-1 font-mono text-xs text-foreground outline-none focus:border-primary"
          placeholder='{"hello":"world"}'
          value={draft.request_body}
          onChange={(e) => setDraft({ ...draft, request_body: e.target.value })}
          disabled={busy}
        />
      </div>

      <div className="flex items-center justify-between pt-1">
        <label className="inline-flex items-center gap-2 text-foreground">
          <input
            type="checkbox"
            checked={draft.enabled}
            onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
          />
          <span>Enabled</span>
        </label>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={onCancel}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button size="sm" className="h-8" onClick={onSubmit} disabled={busy}>
            {draft.id ? "Save" : "Create"}
          </Button>
        </div>
      </div>
    </div>
  );
}
