import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import Editor from "@monaco-editor/react";
import { useApi } from "../lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Fn {
  id: string;
  name: string;
  code: string;
}

export default function FunctionDetailPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const { request } = useApi();
  const [fn, setFn] = useState<Fn | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!id) return;
    request<{ function: Fn }>(`/api/functions/${id}`).then((r) => setFn(r.function));
  }, [id]);

  async function save() {
    if (!fn) return;
    await request(`/api/functions/${fn.id}`, {
      method: "PUT",
      body: JSON.stringify({ name: fn.name, code: fn.code }),
    });
    setDirty(false);
  }

  async function remove() {
    if (!fn || !confirm("Delete this function?")) return;
    await request(`/api/functions/${fn.id}`, { method: "DELETE" });
    nav("/functions");
  }

  if (!fn) return <div>Loading…</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link to="/functions" className="text-zinc-400">
          ← Back
        </Link>
        <Input
          value={fn.name}
          onChange={(e) => {
            setFn({ ...fn, name: e.target.value });
            setDirty(true);
          }}
          className="max-w-sm"
        />
        <Button onClick={save} disabled={!dirty}>
          Save
        </Button>
        <Button variant="destructive" onClick={remove}>
          Delete
        </Button>
      </div>
      <div className="h-[60vh] border border-zinc-800 rounded">
        <Editor
          height="100%"
          defaultLanguage="javascript"
          theme="vs-dark"
          value={fn.code}
          onChange={(v) => {
            setFn({ ...fn, code: v ?? "" });
            setDirty(true);
          }}
          options={{ fontSize: 13, minimap: { enabled: false } }}
        />
      </div>
    </div>
  );
}
