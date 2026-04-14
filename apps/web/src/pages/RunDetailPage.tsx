import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Copy, Play, Terminal } from "lucide-react";
import { toast } from "sonner";
import { publicEndpointUrl, useApi, type Fn } from "../lib/api";
import { Button } from "@/components/ui/button";
import { StatusDot } from "@/components/StatusDot";

type Status = "success" | "error" | "timeout";

interface InvocationDetail {
  id: string;
  function_id: string;
  user_id: string;
  source: "ui" | "api";
  input: unknown;
  output: unknown;
  logs: string[] | null;
  status: Status;
  duration_ms: number;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
}

function copyText(label: string, value: string) {
  navigator.clipboard.writeText(value);
  toast.success(`${label} copied`);
}

function stringifyValue(value: unknown) {
  const text = JSON.stringify(value, null, 2);
  return text ?? "undefined";
}

export default function RunDetailPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const { request } = useApi();
  const [run, setRun] = useState<InvocationDetail | null>(null);
  const [fn, setFn] = useState<Fn | null>(null);

  useEffect(() => {
    if (!id) return;
    request<{ invocation: InvocationDetail }>(`/api/invocations/${id}`).then((r) => {
      setRun(r.invocation);
      request<{ function: Fn }>(`/api/functions/${r.invocation.function_id}`)
        .then((f) => setFn(f.function))
        .catch(() => {});
    });
  }, [id]);

  if (!run) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Loading...
      </div>
    );
  }

  const inputText = stringifyValue(run.input);
  const outputText = stringifyValue(run.output);
  const logsText = (run.logs ?? []).join("\n");

  const curlForRun = () => {
    const base = import.meta.env.VITE_API_URL as string;
    const target =
      fn && fn.slug ? publicEndpointUrl(fn.slug) : `${base}/api/invoke/${run.function_id}`;
    const authLine =
      fn && fn.access_mode === "api_key"
        ? ` \\\n  -H "Authorization: Bearer nvk_your_key"`
        : "";
    const escaped = inputText.replace(/'/g, "'\\''");
    return `curl -X POST ${target}${authLine} \\\n  -H "Content-Type: application/json" \\\n  -d '${escaped}'`;
  };

  return (
    <div className="flex h-full flex-col bg-card text-card-foreground">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border bg-muted/30 px-3">
        <Link
          to="/runs"
          className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="text-sm font-semibold text-foreground">Run detail</div>
        <span className="text-muted-foreground/50">•</span>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <StatusDot status={run.status} />
          <span>{run.status}</span>
          <span>•</span>
          <span>{run.duration_ms}ms</span>
          <span>•</span>
          <span>{run.source}</span>
        </div>
        <div className="flex-1" />
        <Button
          variant="outline"
          size="sm"
          className="h-7"
          onClick={() => copyText("Curl", curlForRun())}
        >
          <Terminal className="mr-1 h-4 w-4" /> Copy as curl
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-7"
          onClick={() =>
            nav(`/functions/${run.function_id}`, {
              state: { prefillInput: inputText },
            })
          }
        >
          <Play className="mr-1 h-4 w-4" /> Reuse input
        </Button>
      </div>

      <div className="grid min-h-0 flex-1 gap-0 lg:grid-cols-[320px_1fr]">
        <div className="overflow-auto border-r border-border bg-muted/20 p-4 text-sm">
          <div className="space-y-4">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
                Function
              </div>
              <Link className="mt-1 block font-mono text-foreground hover:text-primary" to={`/functions/${run.function_id}`}>
                {run.function_id}
              </Link>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
                Started
              </div>
              <div className="mt-1 text-foreground">{new Date(run.started_at).toLocaleString()}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
                Completed
              </div>
              <div className="mt-1 text-foreground">
                {run.completed_at ? new Date(run.completed_at).toLocaleString() : "-"}
              </div>
            </div>
            {run.error_message && (
              <div>
                <div className="mb-2 flex items-center justify-between gap-2 text-[10px] uppercase tracking-wider text-muted-foreground/70">
                  <span>Error</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2"
                    onClick={() => copyText("Error", run.error_message ?? "")}
                  >
                    <Copy className="mr-1 h-3.5 w-3.5" /> Copy
                  </Button>
                </div>
                <pre className="overflow-auto rounded border border-border bg-background p-3 font-mono text-xs text-foreground">
                  {run.error_message}
                </pre>
              </div>
            )}
          </div>
        </div>

        <div className="grid min-h-0 gap-0 md:grid-cols-2">
          <section className="flex min-h-0 flex-col border-b border-border md:border-r">
            <div className="flex h-8 items-center justify-between border-b border-border bg-muted/20 px-3 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              <span>Input</span>
              <Button variant="ghost" size="sm" className="h-6 px-2" onClick={() => copyText("Input", inputText)}>
                <Copy className="mr-1 h-3.5 w-3.5" /> Copy
              </Button>
            </div>
            <pre className="min-h-0 flex-1 overflow-auto bg-background p-3 font-mono text-xs text-foreground">
              {inputText}
            </pre>
          </section>

          <section className="flex min-h-0 flex-col border-b border-border">
            <div className="flex h-8 items-center justify-between border-b border-border bg-muted/20 px-3 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              <span>Output</span>
              <Button variant="ghost" size="sm" className="h-6 px-2" onClick={() => copyText("Output", outputText)}>
                <Copy className="mr-1 h-3.5 w-3.5" /> Copy
              </Button>
            </div>
            <pre className="min-h-0 flex-1 overflow-auto bg-background p-3 font-mono text-xs text-foreground">
              {outputText}
            </pre>
          </section>

          <section className="flex min-h-0 flex-col md:col-span-2">
            <div className="flex h-8 items-center justify-between border-b border-border bg-muted/20 px-3 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              <span>Logs</span>
              <Button variant="ghost" size="sm" className="h-6 px-2" onClick={() => copyText("Logs", logsText)}>
                <Copy className="mr-1 h-3.5 w-3.5" /> Copy
              </Button>
            </div>
            <pre className="min-h-0 flex-1 overflow-auto bg-background p-3 font-mono text-xs text-foreground">
              {logsText || "No logs."}
            </pre>
          </section>
        </div>
      </div>
    </div>
  );
}
