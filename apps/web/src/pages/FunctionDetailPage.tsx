import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import Editor from "@monaco-editor/react";
import { useApi } from "../lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

interface Fn {
  id: string;
  name: string;
  code: string;
}

interface InvokeResponse {
  invocation_id: string;
  status: "success" | "error" | "timeout";
  output: unknown;
  logs: string[] | null;
  error: string | null;
  duration_ms: number;
}

interface HistoryRow {
  id: string;
  status: "success" | "error" | "timeout";
  duration_ms: number;
  started_at: string;
}

interface InvocationDetail {
  id: string;
  status: "success" | "error" | "timeout";
  output: unknown;
  logs: string[] | null;
  error_message: string | null;
  duration_ms: number;
  input: unknown;
}

export default function FunctionDetailPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const { request } = useApi();
  const [fn, setFn] = useState<Fn | null>(null);
  const [dirty, setDirty] = useState(false);
  const [inputText, setInputText] = useState('{\n  "name": "world"\n}');
  const [result, setResult] = useState<InvokeResponse | null>(null);
  const [running, setRunning] = useState(false);
  const [history, setHistory] = useState<HistoryRow[]>([]);

  async function loadHistory() {
    if (!id) return;
    const r = await request<{ invocations: HistoryRow[] }>(
      `/api/functions/${id}/invocations`,
    );
    setHistory(r.invocations);
  }

  useEffect(() => {
    if (!id) return;
    request<{ function: Fn }>(`/api/functions/${id}`).then((r) => setFn(r.function));
    loadHistory();
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

  async function run() {
    if (!fn) return;
    setRunning(true);
    try {
      if (dirty) await save();
      let input: unknown;
      try {
        input = JSON.parse(inputText);
      } catch {
        alert("Input is not valid JSON");
        return;
      }
      const r = await request<InvokeResponse>(`/api/functions/${fn.id}/invoke`, {
        method: "POST",
        body: JSON.stringify(input),
      });
      setResult(r);
      loadHistory();
    } finally {
      setRunning(false);
    }
  }

  async function loadInvocation(invId: string) {
    const { invocation } = await request<{ invocation: InvocationDetail }>(
      `/api/invocations/${invId}`,
    );
    setInputText(JSON.stringify(invocation.input, null, 2));
    setResult({
      invocation_id: invocation.id,
      status: invocation.status,
      output: invocation.output,
      logs: invocation.logs ?? [],
      error: invocation.error_message,
      duration_ms: invocation.duration_ms,
    });
  }

  if (!fn) return <div>Loading…</div>;

  const statusColor =
    result?.status === "success"
      ? "default"
      : result?.status === "timeout"
        ? "secondary"
        : "destructive";

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

      <div className="grid grid-cols-2 gap-4">
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

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="text-sm text-zinc-400">Input (JSON)</div>
            <Button onClick={run} disabled={running}>
              {running ? "Running…" : "Run"}
            </Button>
          </div>
          <textarea
            className="h-32 bg-zinc-900 border border-zinc-800 rounded p-2 font-mono text-xs"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
          />
          <Tabs defaultValue="output" className="flex-1">
            <TabsList>
              <TabsTrigger value="output">Output</TabsTrigger>
              <TabsTrigger value="logs">Logs</TabsTrigger>
            </TabsList>
            <TabsContent value="output">
              {result && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs">
                    <Badge variant={statusColor}>{result.status}</Badge>
                    <span className="text-zinc-400">{result.duration_ms} ms</span>
                  </div>
                  <pre className="bg-zinc-900 border border-zinc-800 rounded p-2 text-xs overflow-auto">
                    {result.status === "success"
                      ? JSON.stringify(result.output, null, 2)
                      : result.error}
                  </pre>
                </div>
              )}
            </TabsContent>
            <TabsContent value="logs">
              <pre className="bg-zinc-900 border border-zinc-800 rounded p-2 text-xs overflow-auto">
                {(result?.logs ?? []).join("\n")}
              </pre>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold mb-2">History</h2>
        {history.length === 0 ? (
          <p className="text-zinc-500 text-sm">No invocations yet.</p>
        ) : (
          <table className="w-full text-xs">
            <thead className="text-zinc-400">
              <tr>
                <th className="text-left p-2">Status</th>
                <th className="text-left p-2">Duration</th>
                <th className="text-left p-2">When</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr
                  key={h.id}
                  className="cursor-pointer hover:bg-zinc-900 border-t border-zinc-900"
                  onClick={() => loadInvocation(h.id)}
                >
                  <td className="p-2">{h.status}</td>
                  <td className="p-2">{h.duration_ms} ms</td>
                  <td className="p-2">{new Date(h.started_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
