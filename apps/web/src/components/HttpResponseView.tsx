import { StatusDot } from "@/components/StatusDot";
import type { InvokeResponse } from "@/lib/api";

interface Props {
  result: InvokeResponse | null;
}

function statusClass(status: number) {
  if (status >= 200 && status < 300) return "text-emerald-500";
  if (status >= 300 && status < 400) return "text-sky-500";
  if (status >= 400 && status < 500) return "text-amber-500";
  return "text-rose-500";
}

function formatBody(body: string, headers: Record<string, string>): string {
  const ct = headers["content-type"] ?? "";
  if (ct.includes("application/json")) {
    try {
      return JSON.stringify(JSON.parse(body), null, 2);
    } catch {
      /* fallthrough */
    }
  }
  return body;
}

export function HttpResponseView({ result }: Props) {
  if (!result) {
    return (
      <div className="pt-8 text-center text-sm text-muted-foreground/70">
        Run the function to see the response
      </div>
    );
  }

  if (result.status !== "success" || !result.response) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-2 border-b border-border bg-muted/20 px-3 py-2 text-xs">
          <StatusDot status={result.status} />
          <span className="font-medium text-foreground">{result.status}</span>
          <span className="text-muted-foreground">·</span>
          <span className="font-mono text-muted-foreground">{result.duration_ms}ms</span>
        </div>
        <pre className="min-h-0 flex-1 overflow-auto p-3 font-mono text-xs text-foreground">
          {result.error ?? ""}
        </pre>
      </div>
    );
  }

  const { status, headers, body } = result.response;
  const headerLines = Object.entries(headers)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/20 px-3 py-2 text-xs">
        <span className={`font-mono font-semibold ${statusClass(status)}`}>
          {status}
        </span>
        <span className="text-muted-foreground">·</span>
        <span className="font-mono text-muted-foreground">{result.duration_ms}ms</span>
        <span className="text-muted-foreground">·</span>
        <span className="text-muted-foreground">
          {headers["content-type"] ?? "no content-type"}
        </span>
      </div>
      <div className="border-b border-border px-3 py-2">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
          Response headers
        </div>
        <pre className="mt-1 font-mono text-[11px] text-foreground">
          {headerLines || "(none)"}
        </pre>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-3 py-2">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
          Response body
        </div>
        <pre className="mt-1 font-mono text-xs text-foreground">
          {formatBody(body, headers)}
        </pre>
      </div>
    </div>
  );
}
