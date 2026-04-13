import { useEffect, useState } from "react";
import { Plus, Copy, Trash2, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { useApi } from "../lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/EmptyState";

interface Key {
  id: string;
  name: string;
  prefix: string;
  last_used_at: string | null;
  created_at: string;
}

export default function ApiKeysPage() {
  const { request } = useApi();
  const [keys, setKeys] = useState<Key[]>([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [rawKey, setRawKey] = useState<string | null>(null);

  async function load() {
    const r = await request<{ keys: Key[] }>("/api/keys");
    setKeys(r.keys);
  }
  useEffect(() => {
    load();
  }, []);

  async function create() {
    const r = await request<{ key: Key; raw_key: string }>("/api/keys", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
    setRawKey(r.raw_key);
    setName("");
    load();
  }

  async function remove(id: string) {
    if (!confirm("Delete this key?")) return;
    await request(`/api/keys/${id}`, { method: "DELETE" });
    toast.success("Key revoked");
    load();
  }

  return (
    <div className="flex h-full flex-col bg-card text-card-foreground">
      {/* Toolbar */}
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border bg-muted/30 px-3">
        <div className="text-sm font-semibold text-foreground">API Keys</div>
        <span className="text-muted-foreground/50">•</span>
        <div className="text-xs text-muted-foreground">
          Manage keys for programmatic access.
        </div>
        <div className="flex-1" />
        <Dialog
          open={open}
          onOpenChange={(v) => {
            setOpen(v);
            if (!v) setRawKey(null);
          }}
        >
          <DialogTrigger asChild>
            <Button size="sm" className="h-7">
              <Plus className="mr-1 h-4 w-4" /> New key
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{rawKey ? "Your new key" : "New API key"}</DialogTitle>
            </DialogHeader>
            {rawKey ? (
              <div className="space-y-2">
                <p className="text-sm text-secondary-foreground">
                  Copy this now. It won't be shown again.
                </p>
                <code className="block rounded-md border border-border bg-background p-3 font-mono text-xs text-foreground break-all">
                  {rawKey}
                </code>
                <Button
                  onClick={() => {
                    navigator.clipboard.writeText(rawKey);
                    toast.success("Copied to clipboard");
                  }}
                >
                  <Copy className="mr-1 h-4 w-4" /> Copy
                </Button>
              </div>
            ) : (
              <>
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
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {/* Body: keys list (top) + usage docs (bottom) */}
      <div className="min-h-0 flex-1 overflow-auto">
        {keys.length === 0 ? (
          <div className="flex items-center justify-center p-8">
            <EmptyState
              icon={<KeyRound className="h-8 w-8" />}
              title="No API keys yet"
              body="Create a key to invoke your functions from other services."
            />
          </div>
        ) : (
          <table className="w-full">
            <thead className="sticky top-0 z-10 bg-card">
              <tr className="border-b border-border text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Prefix</th>
                <th className="px-4 py-2 font-medium">Last used</th>
                <th className="px-4 py-2 font-medium">Created</th>
                <th className="px-4 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr
                  key={k.id}
                  className="border-b border-border hover:bg-accent/50"
                >
                  <td className="px-4 py-3 font-medium text-foreground">{k.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {k.prefix}…
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {k.last_used_at
                      ? new Date(k.last_used_at).toLocaleString()
                      : "never"}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {new Date(k.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => remove(k.id)}
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Usage docs panel */}
        <div className="border-t border-border bg-muted/20">
          <div className="flex h-8 items-center border-b border-border px-4 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Using the API
          </div>
          <pre className="overflow-auto bg-background p-4 font-mono text-xs text-foreground">
{`curl -X POST ${import.meta.env.VITE_API_URL}/api/invoke/<FUNCTION_ID> \\
  -H "Authorization: Bearer nvk_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{"name":"world"}'`}
          </pre>
        </div>
      </div>
    </div>
  );
}
