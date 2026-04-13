import { SUPPORTED_METHODS, type HttpMethod } from "@/lib/api";

export interface HttpRequestDraft {
  method: HttpMethod;
  headers: string;
  body: string;
}

interface Props {
  value: HttpRequestDraft;
  allowedMethods: HttpMethod[];
  onChange: (next: HttpRequestDraft) => void;
}

export function HttpRequestEditor({ value, allowedMethods, onChange }: Props) {
  const methodChoices = allowedMethods.length > 0 ? allowedMethods : SUPPORTED_METHODS;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <select
          className="h-8 rounded border border-border bg-card px-2 font-mono text-xs text-foreground outline-none focus:border-primary"
          value={value.method}
          onChange={(e) =>
            onChange({ ...value, method: e.target.value as HttpMethod })
          }
        >
          {methodChoices.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          request
        </span>
      </div>
      <div className="border-b border-border px-3 py-2">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
          Headers (JSON)
        </div>
        <textarea
          className="mt-1 block h-20 w-full resize-none rounded border border-border bg-card p-2 font-mono text-xs text-foreground focus:outline-none"
          value={value.headers}
          onChange={(e) => onChange({ ...value, headers: e.target.value })}
          spellCheck={false}
        />
      </div>
      <div className="flex min-h-0 flex-1 flex-col px-3 py-2">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
          Body (JSON)
        </div>
        <textarea
          className="mt-1 block min-h-0 flex-1 resize-none rounded border border-border bg-card p-2 font-mono text-xs text-foreground focus:outline-none"
          value={value.body}
          onChange={(e) => onChange({ ...value, body: e.target.value })}
          spellCheck={false}
        />
      </div>
    </div>
  );
}
