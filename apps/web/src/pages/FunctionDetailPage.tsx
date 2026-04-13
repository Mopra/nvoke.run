import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import Editor from "@monaco-editor/react";
import { ArrowLeft, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useApi } from "../lib/api";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RunButton } from "@/components/RunButton";
import { StatusDot } from "@/components/StatusDot";

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

type RunState = "idle" | "running" | "success" | "error";

export default function FunctionDetailPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const { request } = useApi();
  const [fn, setFn] = useState<Fn | null>(null);
  const [dirty, setDirty] = useState(false);
  const [inputText, setInputText] = useState('{\n  "name": "world"\n}');
  const [result, setResult] = useState<InvokeResponse | null>(null);
  const [runState, setRunState] = useState<RunState>("idle");

  useEffect(() => {
    if (!id) return;
    request<{ function: Fn }>(`/api/functions/${id}`).then((r) => setFn(r.function));
  }, [id]);

  useEffect(() => {
    if (runState === "success" || runState === "error") {
      const t = setTimeout(() => setRunState("idle"), 4000);
      return () => clearTimeout(t);
    }
  }, [runState]);

  async function save() {
    if (!fn) return;
    await request(`/api/functions/${fn.id}`, {
      method: "PUT",
      body: JSON.stringify({ name: fn.name, code: fn.code }),
    });
    setDirty(false);
    toast.success("Saved");
  }

  async function remove() {
    if (!fn || !confirm("Delete this function?")) return;
    await request(`/api/functions/${fn.id}`, { method: "DELETE" });
    nav("/functions");
  }

  async function run() {
    if (!fn) return;
    setRunState("running");
    try {
      if (dirty) await save();
      let input: unknown;
      try {
        input = JSON.parse(inputText);
      } catch {
        toast.error("Input is not valid JSON");
        setRunState("idle");
        return;
      }
      const r = await request<InvokeResponse>(`/api/functions/${fn.id}/invoke`, {
        method: "POST",
        body: JSON.stringify(input),
      });
      setResult(r);
      setRunState(r.status === "success" ? "success" : "error");
    } catch (e) {
      setRunState("error");
      toast.error(String(e));
    }
  }

  if (!fn)
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Loading…
      </div>
    );

  return (
    <div className="flex h-full flex-col bg-card text-card-foreground">
      {/* Toolbar panel */}
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border bg-muted/30 px-3">
        <Link
          to="/functions"
          className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="h-5 w-px bg-border" />
        <input
          value={fn.name}
          onChange={(e) => {
            setFn({ ...fn, name: e.target.value });
            setDirty(true);
          }}
          className="min-w-0 flex-1 border-none bg-transparent text-sm font-semibold text-foreground focus:outline-none focus:ring-0"
        />
        {dirty && (
          <span className="rounded bg-secondary px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-secondary-foreground">
            Unsaved
          </span>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={save}
          disabled={!dirty}
          className="h-7"
        >
          Save
        </Button>
        <RunButton
          state={runState}
          duration={result?.duration_ms}
          onClick={run}
          disabled={runState === "running"}
        />
        <div className="h-5 w-px bg-border" />
        <Button
          variant="ghost"
          size="sm"
          onClick={remove}
          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {/* Body: editor panel | side panel */}
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col border-r border-border bg-background">
          <div className="flex h-8 shrink-0 items-center border-b border-border bg-muted/20 px-3 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            index.js
          </div>
          <div className="min-h-0 flex-1">
            <Editor
              height="100%"
              defaultLanguage="javascript"
              theme="vs-dark"
              value={fn.code}
              onChange={(v) => {
                setFn({ ...fn, code: v ?? "" });
                setDirty(true);
              }}
              options={{
                fontSize: 13,
                minimap: { enabled: false },
                padding: { top: 12 },
                fontFamily: "JetBrains Mono, ui-monospace, monospace",
              }}
            />
          </div>
        </div>

        <div className="flex w-[38%] min-w-0 flex-col">
          {/* Top panel: Input / Logs / Info tabs */}
          <div className="flex min-h-0 flex-1 flex-col border-b border-border">
            <Tabs defaultValue="input" className="flex min-h-0 flex-1 flex-col">
              <TabsList className="h-8 shrink-0 justify-start rounded-none border-b border-border bg-muted/20 px-2">
                <TabsTrigger value="input">Input</TabsTrigger>
                <TabsTrigger value="logs">Logs</TabsTrigger>
                <TabsTrigger value="info">Info</TabsTrigger>
              </TabsList>
              <TabsContent
                value="input"
                className="mt-0 min-h-0 flex-1 overflow-hidden p-0"
              >
                <textarea
                  className="block h-full w-full resize-none border-0 bg-background p-3 font-mono text-xs text-foreground focus:outline-none"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                />
              </TabsContent>
              <TabsContent
                value="logs"
                className="mt-0 min-h-0 flex-1 overflow-auto bg-background p-0"
              >
                <pre className="h-full w-full p-3 font-mono text-xs text-foreground">
                  {(result?.logs ?? []).join("\n") || "No logs yet."}
                </pre>
              </TabsContent>
              <TabsContent
                value="info"
                className="mt-0 min-h-0 flex-1 overflow-auto bg-background p-4 text-xs text-muted-foreground"
              >
                <div className="space-y-4">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
                      Function ID
                    </div>
                    <div className="mt-1 font-mono text-foreground">{fn.id}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
                      Invoke URL
                    </div>
                    <div className="mt-1 break-all font-mono text-foreground">
                      {import.meta.env.VITE_API_URL}/api/invoke/{fn.id}
                    </div>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>

          {/* Bottom panel: Output */}
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex h-8 shrink-0 items-center gap-2 border-b border-border bg-muted/20 px-3 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              <span>Output</span>
              {result && (
                <>
                  <span className="text-muted-foreground/50">•</span>
                  <StatusDot status={result.status} />
                  <span className="text-muted-foreground">{result.status}</span>
                  <span className="text-muted-foreground/50">•</span>
                  <span className="font-mono text-muted-foreground">
                    {result.duration_ms}ms
                  </span>
                </>
              )}
            </div>
            <div className="min-h-0 flex-1 overflow-auto bg-background">
              {result ? (
                <pre className="p-3 font-mono text-xs text-foreground">
                  {result.status === "success"
                    ? JSON.stringify(result.output, null, 2)
                    : result.error}
                </pre>
              ) : (
                <div className="pt-8 text-center text-sm text-muted-foreground/70">
                  Run the function to see output
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
