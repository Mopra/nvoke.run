import { useEffect, useState } from "react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Key {
  id: string;
  name: string;
  prefix: string;
  last_used_at: string | null;
  created_at: string;
}

export default function SettingsPage() {
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
    load();
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">API Keys</h1>
        <Dialog
          open={open}
          onOpenChange={(v) => {
            setOpen(v);
            if (!v) setRawKey(null);
          }}
        >
          <DialogTrigger asChild>
            <Button>New key</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{rawKey ? "Your new key" : "New API key"}</DialogTitle>
            </DialogHeader>
            {rawKey ? (
              <div className="space-y-2">
                <p className="text-sm text-amber-400">
                  Copy this now. It won't be shown again.
                </p>
                <code className="block bg-zinc-900 border border-zinc-800 rounded p-2 text-xs break-all">
                  {rawKey}
                </code>
                <Button onClick={() => navigator.clipboard.writeText(rawKey)}>
                  Copy
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

      {keys.length === 0 ? (
        <p className="text-zinc-400">No keys yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Prefix</TableHead>
              <TableHead>Last used</TableHead>
              <TableHead>Created</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {keys.map((k) => (
              <TableRow key={k.id}>
                <TableCell>{k.name}</TableCell>
                <TableCell>
                  <code>{k.prefix}…</code>
                </TableCell>
                <TableCell>
                  {k.last_used_at ? new Date(k.last_used_at).toLocaleString() : "—"}
                </TableCell>
                <TableCell>{new Date(k.created_at).toLocaleString()}</TableCell>
                <TableCell>
                  <Button variant="destructive" size="sm" onClick={() => remove(k.id)}>
                    Delete
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <div className="space-y-2">
        <h2 className="text-sm font-semibold">Using the API</h2>
        <pre className="bg-zinc-900 border border-zinc-800 rounded p-3 text-xs overflow-auto">
          {`curl -X POST ${import.meta.env.VITE_API_URL}/api/invoke/<FUNCTION_ID> \\
  -H "Authorization: Bearer nvk_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{"name":"world"}'`}
        </pre>
      </div>
    </div>
  );
}
