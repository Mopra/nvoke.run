import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  SUPPORTED_METHODS,
  publicEndpointUrl,
  type AccessMode,
  type HttpMethod,
} from "@/lib/api";

export interface HttpConfigValue {
  slug: string | null;
  access_mode: AccessMode;
  enabled: boolean;
  methods: HttpMethod[];
}

interface Props {
  value: HttpConfigValue;
  onChange: (next: HttpConfigValue) => void;
}

function copyText(label: string, value: string) {
  if (!value) return;
  navigator.clipboard.writeText(value);
  toast.success(`${label} copied`);
}

export function HttpConfigPanel({ value, onChange }: Props) {
  const endpoint = publicEndpointUrl(value.slug);

  function toggleMethod(m: HttpMethod) {
    const set = new Set(value.methods);
    if (set.has(m)) set.delete(m);
    else set.add(m);
    const next = SUPPORTED_METHODS.filter((x) => set.has(x));
    onChange({ ...value, methods: next });
  }

  return (
    <div className="space-y-4 text-xs">
      <div>
        <label className="block text-[10px] uppercase tracking-wider text-muted-foreground/70">
          Slug
        </label>
        <input
          className="mt-1 h-8 w-full rounded border border-border bg-card px-2 font-mono text-foreground outline-none focus:border-primary"
          placeholder="my-endpoint"
          value={value.slug ?? ""}
          onChange={(e) =>
            onChange({
              ...value,
              slug: e.target.value.trim() === "" ? null : e.target.value.trim(),
            })
          }
        />
      </div>

      <div>
        <div className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-wider text-muted-foreground/70">
          <span>Public endpoint</span>
          {endpoint && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2"
              onClick={() => copyText("Endpoint URL", endpoint)}
            >
              <Copy className="mr-1 h-3.5 w-3.5" /> Copy
            </Button>
          )}
        </div>
        <div className="mt-1 break-all font-mono text-foreground">
          {endpoint || <span className="text-muted-foreground">set a slug to expose the endpoint</span>}
        </div>
      </div>

      <div>
        <label className="block text-[10px] uppercase tracking-wider text-muted-foreground/70">
          Access mode
        </label>
        <select
          className="mt-1 h-8 w-full rounded border border-border bg-card px-2 text-foreground outline-none focus:border-primary"
          value={value.access_mode}
          onChange={(e) =>
            onChange({ ...value, access_mode: e.target.value as AccessMode })
          }
        >
          <option value="api_key">API key (private)</option>
          <option value="public">Public (no auth)</option>
        </select>
      </div>

      <div>
        <label className="block text-[10px] uppercase tracking-wider text-muted-foreground/70">
          Allowed methods
        </label>
        <div className="mt-1 flex flex-wrap gap-1">
          {SUPPORTED_METHODS.map((m) => {
            const on = value.methods.includes(m);
            return (
              <button
                key={m}
                type="button"
                onClick={() => toggleMethod(m)}
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

      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
            Enabled
          </div>
          <div className="text-foreground">
            {value.enabled ? "Accepting traffic" : "Disabled (returns 404)"}
          </div>
        </div>
        <Button
          variant={value.enabled ? "outline" : "default"}
          size="sm"
          className="h-7"
          onClick={() => onChange({ ...value, enabled: !value.enabled })}
        >
          {value.enabled ? "Disable" : "Enable"}
        </Button>
      </div>
    </div>
  );
}
