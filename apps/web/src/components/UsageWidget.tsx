import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Zap } from "lucide-react";
import { useApi, type Usage } from "../lib/api";

export function UsageWidget() {
  const { request } = useApi();
  const [usage, setUsage] = useState<Usage | null>(null);
  const location = useLocation();

  useEffect(() => {
    let cancelled = false;
    const fetchUsage = () => {
      request<Usage>("/api/usage")
        .then((u) => {
          if (!cancelled) setUsage(u);
        })
        .catch(() => {
          /* non-blocking */
        });
    };
    fetchUsage();
    const interval = setInterval(fetchUsage, 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // Refresh on route change so invoke→return updates the count.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  if (!usage) return null;

  const { used, limit } = usage.daily;
  const pct = Math.min(100, Math.round((used / limit) * 100));
  const warn = pct >= 80;
  const danger = pct >= 100;

  return (
    <Link
      to="/billing"
      title={`${usage.plan} plan · ${used.toLocaleString()} / ${limit.toLocaleString()} today`}
      className="group flex items-center gap-2 rounded-md border border-border/40 bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground transition hover:border-border hover:text-foreground"
    >
      <Zap
        className={`h-3.5 w-3.5 ${
          danger
            ? "text-destructive"
            : warn
              ? "text-amber-400"
              : "text-primary"
        }`}
      />
      <span className="font-medium capitalize text-foreground">{usage.plan}</span>
      <span className="text-muted-foreground/60">·</span>
      <span className="tabular-nums">
        {used.toLocaleString()}
        <span className="text-muted-foreground/60">/{limit.toLocaleString()}</span>
      </span>
      <div className="relative h-1 w-12 overflow-hidden rounded-full bg-border/60">
        <div
          className={`absolute inset-y-0 left-0 ${
            danger
              ? "bg-destructive"
              : warn
                ? "bg-amber-400"
                : "bg-primary"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </Link>
  );
}
