import { useState } from "react";
import { Package, Plus, Trash2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import type { BuildStatus, DependencyMap } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/EmptyState";

const NAME_RE = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
const VERSION_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const MAX_DEPS = 20;

export interface DependenciesPanelProps {
  dependencies: DependencyMap;
  buildStatus: BuildStatus;
  buildError: string | null;
  builtAt: string | null;
  onChange: (next: DependencyMap) => void;
}

export function DependenciesPanel({
  dependencies,
  buildStatus,
  buildError,
  builtAt,
  onChange,
}: DependenciesPanelProps) {
  const [name, setName] = useState("");
  const [version, setVersion] = useState("");

  const entries = Object.entries(dependencies).sort(([a], [b]) => a.localeCompare(b));
  const atLimit = entries.length >= MAX_DEPS;

  function add() {
    const n = name.trim();
    const v = version.trim();
    if (!n || !v) return;
    if (!NAME_RE.test(n)) {
      toast.error("Invalid package name");
      return;
    }
    if (!VERSION_RE.test(v)) {
      toast.error("Version must be exact semver (e.g. 1.2.3)");
      return;
    }
    if (atLimit) {
      toast.error(`At most ${MAX_DEPS} dependencies`);
      return;
    }
    onChange({ ...dependencies, [n]: v });
    setName("");
    setVersion("");
  }

  function remove(pkg: string) {
    const next = { ...dependencies };
    delete next[pkg];
    onChange(next);
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-2 flex items-center gap-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          <span>Build status</span>
        </div>
        {buildStatus === "ok" ? (
          <div className="flex items-center gap-2 rounded border border-border bg-card px-3 py-2 text-sm text-foreground">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            <span>Build succeeded</span>
            {builtAt && (
              <span className="ml-auto font-mono text-xs text-muted-foreground">
                {new Date(builtAt).toLocaleString()}
              </span>
            )}
          </div>
        ) : buildStatus === "error" ? (
          <div className="space-y-2 rounded border border-destructive/40 bg-destructive/10 p-3 text-sm">
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-4 w-4" />
              <span>Build failed — function will return 503 until fixed</span>
            </div>
            {buildError && (
              <pre className="max-h-48 overflow-auto rounded bg-background p-2 font-mono text-[11px] text-foreground">
                {buildError}
              </pre>
            )}
          </div>
        ) : (
          <div className="rounded border border-border bg-card px-3 py-2 text-sm text-muted-foreground">
            No build yet — add a dependency to bundle your function.
          </div>
        )}
      </div>

      <div>
        <div className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Add dependency
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            className="h-8 flex-1 min-w-[160px] font-mono text-xs"
            placeholder="package-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") add();
            }}
            disabled={atLimit}
          />
          <Input
            className="h-8 w-32 font-mono text-xs"
            placeholder="1.2.3"
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") add();
            }}
            disabled={atLimit}
          />
          <Button
            size="sm"
            className="h-8"
            onClick={add}
            disabled={atLimit || !name.trim() || !version.trim()}
          >
            <Plus className="mr-1 h-4 w-4" /> Add
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Exact versions only (no ranges). Bundled into your function on save. Up to{" "}
          {MAX_DEPS} packages, no native modules.
        </p>
      </div>

      <div>
        <div className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Configured dependencies
        </div>
        {entries.length === 0 ? (
          <EmptyState
            icon={<Package className="h-6 w-6" />}
            title="No dependencies yet"
            body="Add npm packages to import in your function. They'll be bundled when you save."
          />
        ) : (
          <div className="divide-y divide-border rounded border border-border bg-card">
            {entries.map(([pkg, ver]) => (
              <div key={pkg} className="flex items-center gap-2 px-3 py-2 text-sm">
                <Package className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate font-mono text-foreground">{pkg}</span>
                <span className="font-mono text-xs text-muted-foreground">{ver}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                  onClick={() => remove(pkg)}
                  title="Remove"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
