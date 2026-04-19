import { useEffect, useMemo, useRef, useState } from "react";
import {
  Link,
  useBeforeUnload,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import Editor from "@monaco-editor/react";
import {
  ArrowLeft,
  Copy,
  Download,
  History as HistoryIcon,
  Play,
  Save,
  Sparkles,
  Trash2,
  Upload,
  CopyPlus,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import {
  ApiError,
  publicEndpointUrl,
  useApi,
  type Fn,
  type FunctionVersion,
  type HttpMethod,
  type InvokeResponse,
  type RunSummary,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { OverflowTabsList, type OverflowTabItem } from "@/components/OverflowTabsList";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { RunButton } from "@/components/RunButton";
import { StatusDot } from "@/components/StatusDot";
import { HttpConfigPanel, type HttpConfigValue } from "@/components/HttpConfigPanel";
import {
  HttpRequestEditor,
  type HttpRequestDraft,
} from "@/components/HttpRequestEditor";
import { HttpResponseView } from "@/components/HttpResponseView";
import { EnvVarsPanel } from "@/components/EnvVarsPanel";
import { DependenciesPanel } from "@/components/DependenciesPanel";
import { SchedulesPanel } from "@/components/SchedulesPanel";
import { TriggerEventsPanel } from "@/components/TriggerEventsPanel";
import { WebhookVerifyPanel } from "@/components/WebhookVerifyPanel";
import { AiChatPanel } from "@/components/AiChatPanel";
import {
  deleteTestCase,
  listSavedTestCases,
  saveTestCase,
  type SavedTestCase,
} from "@/lib/testCases";
import { exportTestCases, parseTestCasesFile } from "@/lib/testCasesIO";
import { clearDraft, loadDraft, saveDraft } from "@/lib/draftStore";
import { formatJavaScript } from "@/lib/formatCode";
import { useConfirm } from "@/components/ConfirmDialog";

interface ResponseHistoryEntry {
  id: string;
  timestamp: string;
  result: InvokeResponse;
  input: string;
  method: string;
}

const SPLIT_KEY = "nvoke:editor-split";
const DEFAULT_SIDE_WIDTH = 44;
const CHAT_OPEN_KEY = "nvoke:ai-chat-open";
const CHAT_WIDTH_KEY = "nvoke:ai-chat-width";
const DEFAULT_CHAT_WIDTH = 360;
const MIN_CHAT_WIDTH = 280;
const MAX_CHAT_WIDTH = 640;
const RESPONSE_HEIGHT_KEY = "nvoke:response-height";
const DEFAULT_RESPONSE_HEIGHT = 50;
const MIN_RESPONSE_HEIGHT = 15;
const MAX_RESPONSE_HEIGHT = 85;

interface InvocationDetail extends RunSummary {
  user_id: string;
  input: unknown;
  output: unknown;
  logs: string[] | null;
  error_message: string | null;
}

type RunState = "idle" | "running" | "success" | "error";

function relTime(iso: string): string {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return `${Math.floor(d)}s ago`;
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}

function copyText(label: string, value: string) {
  navigator.clipboard.writeText(value);
  toast.success(`${label} copied`);
}

const DEFAULT_HEADERS = `{
  "content-type": "application/json"
}`;

const DEFAULT_BODY = `{
  "name": "world"
}`;

export default function FunctionDetailPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const location = useLocation();
  const { request } = useApi();
  const confirm = useConfirm();
  const [fn, setFn] = useState<Fn | null>(null);
  const [dirty, setDirty] = useState(false);
  const [draft, setDraft] = useState<HttpRequestDraft>({
    method: "POST",
    headers: DEFAULT_HEADERS,
    body: DEFAULT_BODY,
  });
  const [result, setResult] = useState<InvokeResponse | null>(null);
  const [runState, setRunState] = useState<RunState>("idle");
  const [recentRuns, setRecentRuns] = useState<RunSummary[]>([]);
  const [versions, setVersions] = useState<FunctionVersion[]>([]);
  const [savedCases, setSavedCases] = useState<SavedTestCase[]>([]);
  const [newCaseName, setNewCaseName] = useState("");
  const [responseHistory, setResponseHistory] = useState<ResponseHistoryEntry[]>([]);
  const [sideWidth, setSideWidth] = useState<number>(() => {
    if (typeof window === "undefined") return DEFAULT_SIDE_WIDTH;
    const raw = window.localStorage.getItem(SPLIT_KEY);
    const parsed = raw ? Number(raw) : DEFAULT_SIDE_WIDTH;
    return Number.isFinite(parsed) && parsed >= 25 && parsed <= 75
      ? parsed
      : DEFAULT_SIDE_WIDTH;
  });
  const [chatOpen, setChatOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(CHAT_OPEN_KEY) === "1";
  });
  const [chatWidth, setChatWidth] = useState<number>(() => {
    if (typeof window === "undefined") return DEFAULT_CHAT_WIDTH;
    const raw = window.localStorage.getItem(CHAT_WIDTH_KEY);
    const parsed = raw ? Number(raw) : DEFAULT_CHAT_WIDTH;
    return Number.isFinite(parsed) && parsed >= MIN_CHAT_WIDTH && parsed <= MAX_CHAT_WIDTH
      ? parsed
      : DEFAULT_CHAT_WIDTH;
  });
  const [responseHeight, setResponseHeight] = useState<number>(() => {
    if (typeof window === "undefined") return DEFAULT_RESPONSE_HEIGHT;
    const raw = window.localStorage.getItem(RESPONSE_HEIGHT_KEY);
    const parsed = raw ? Number(raw) : DEFAULT_RESPONSE_HEIGHT;
    return Number.isFinite(parsed) && parsed >= MIN_RESPONSE_HEIGHT && parsed <= MAX_RESPONSE_HEIGHT
      ? parsed
      : DEFAULT_RESPONSE_HEIGHT;
  });
  const [activeTab, setActiveTab] = useState("request");
  const splitContainerRef = useRef<HTMLDivElement | null>(null);
  const rightColumnRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);
  const draggingChatRef = useRef(false);
  const draggingResponseRef = useRef(false);
  const draftLoadedRef = useRef(false);
  const importFileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    try {
      window.localStorage.setItem(CHAT_OPEN_KEY, chatOpen ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [chatOpen]);

  useBeforeUnload(
    (event) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    },
    { capture: true },
  );

  useEffect(() => {
    if (!dirty) return;
    function onDocumentClick(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const link = target.closest("a[href]");
      if (!link) return;
      const href = link.getAttribute("href");
      if (!href || href.startsWith("#") || link.getAttribute("target") === "_blank") return;
      event.preventDefault();
      event.stopPropagation();
      void confirm({
        title: "Discard unsaved changes?",
        description: "Your edits to this function haven't been saved yet.",
        confirmLabel: "Discard",
        destructive: true,
      }).then((ok) => {
        if (ok) {
          setDirty(false);
          nav(href);
        }
      });
    }
    document.addEventListener("click", onDocumentClick, true);
    return () => document.removeEventListener("click", onDocumentClick, true);
  }, [dirty, confirm, nav]);

  async function loadFunction(functionId: string) {
    const [functionRes, runsRes, versionsRes] = await Promise.all([
      request<{ function: Fn }>(`/api/functions/${functionId}`),
      request<{ invocations: RunSummary[] }>(`/api/functions/${functionId}/invocations`),
      request<{ versions: FunctionVersion[] }>(`/api/functions/${functionId}/versions`),
    ]);
    const loaded = functionRes.function;
    const stored = loadDraft(functionId);
    if (stored && stored.updatedAt > loaded.updated_at) {
      setFn({ ...loaded, code: stored.code });
      setDraft({
        method: (stored.method as HttpMethod) ?? "POST",
        headers: stored.headers,
        body: stored.body,
      });
      setDirty(true);
      toast.info("Unsaved draft restored");
    } else {
      setFn(loaded);
      if (stored) clearDraft(functionId);
    }
    setRecentRuns(runsRes.invocations);
    setVersions(versionsRes.versions);
    setSavedCases(listSavedTestCases(functionId));
    const allowed = loaded.methods;
    setDraft((d) =>
      allowed.includes(d.method) || allowed.length === 0
        ? d
        : { ...d, method: allowed[0] },
    );
    draftLoadedRef.current = true;
  }

  useEffect(() => {
    draftLoadedRef.current = false;
    if (!id) return;
    loadFunction(id);
  }, [id]);

  useEffect(() => {
    if (!id || !fn || !draftLoadedRef.current) return;
    if (!dirty) return;
    const handle = setTimeout(() => {
      saveDraft(id, {
        code: fn.code,
        body: draft.body,
        headers: draft.headers,
        method: draft.method,
        updatedAt: new Date().toISOString(),
      });
    }, 400);
    return () => clearTimeout(handle);
  }, [id, fn, draft, dirty]);

  useEffect(() => {
    const prefill = (location.state as { prefillInput?: string } | null)?.prefillInput;
    if (!prefill) return;
    setDraft((d) => ({ ...d, body: prefill }));
    window.history.replaceState({}, document.title);
  }, [location.state]);

  useEffect(() => {
    if (runState === "success" || runState === "error") {
      const t = setTimeout(() => setRunState("idle"), 4000);
      return () => clearTimeout(t);
    }
  }, [runState]);

  const endpointUrl = useMemo(
    () => (fn ? publicEndpointUrl(fn.slug) : ""),
    [fn],
  );

  const curlSnippet = useMemo(() => {
    if (!fn || !endpointUrl) return "";
    const authLine =
      fn.access_mode === "api_key" ? ` \\\n  -H "Authorization: Bearer nvk_your_key"` : "";
    return `curl -X ${draft.method} ${endpointUrl}${authLine} \\\n  -H "Content-Type: application/json" \\\n  -d '${draft.body.replace(/'/g, "'\\''")}'`;
  }, [fn, draft, endpointUrl]);

  async function save(overrides?: Partial<Fn>) {
    if (!fn) return;
    const merged = { ...fn, ...overrides };
    const res = await request<{ function: Fn }>(`/api/functions/${fn.id}`, {
      method: "PUT",
      body: JSON.stringify({
        name: merged.name,
        code: merged.code,
        slug: merged.slug,
        access_mode: merged.access_mode,
        enabled: merged.enabled,
        methods: merged.methods,
        dependencies: merged.dependencies,
      }),
    });
    setFn(res.function);
    setDirty(false);
    clearDraft(res.function.id);
    try {
      const v = await request<{ versions: FunctionVersion[] }>(
        `/api/functions/${res.function.id}/versions`,
      );
      setVersions(v.versions);
    } catch {
      /* best-effort refresh */
    }
    if (res.function.build_status === "error") {
      toast.error("Saved, but build failed — see Deps tab");
    } else {
      toast.success("Saved");
    }
  }

  async function rollbackVersion(versionId: string) {
    if (!fn) return;
    if (dirty) {
      const ok = await confirm({
        title: "Discard unsaved changes?",
        description: "Rolling back will overwrite your current edits.",
        confirmLabel: "Discard and roll back",
        destructive: true,
      });
      if (!ok) return;
    }
    const res = await request<{ function: Fn }>(
      `/api/functions/${fn.id}/versions/${versionId}/rollback`,
      { method: "POST" },
    );
    setFn(res.function);
    setDirty(false);
    clearDraft(res.function.id);
    try {
      const v = await request<{ versions: FunctionVersion[] }>(
        `/api/functions/${fn.id}/versions`,
      );
      setVersions(v.versions);
    } catch {
      /* ignore */
    }
    toast.success("Rolled back");
  }

  async function formatCode() {
    if (!fn) return;
    try {
      const formatted = await formatJavaScript(fn.code);
      if (formatted !== fn.code) {
        setFn({ ...fn, code: formatted });
        setDirty(true);
      }
      toast.success("Formatted");
    } catch (e) {
      toast.error(`Format failed: ${String(e)}`);
    }
  }

  async function remove() {
    if (!fn) return;
    const ok = await confirm({
      title: "Delete this function?",
      description: `"${fn.name}" will be permanently removed along with its invocation history.`,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    await request(`/api/functions/${fn.id}`, { method: "DELETE" });
    nav("/functions");
  }

  async function duplicate() {
    if (!fn) return;
    const res = await request<{ function: Fn }>("/api/functions", {
      method: "POST",
      body: JSON.stringify({
        name: `${fn.name} copy`,
        code: fn.code,
        access_mode: fn.access_mode,
        enabled: fn.enabled,
        methods: fn.methods,
      }),
    });
    toast.success("Function duplicated");
    nav(`/functions/${res.function.id}`);
  }

  async function run() {
    if (!fn) return;
    setRunState("running");
    try {
      if (dirty) await save();
      let body: unknown;
      try {
        body = draft.body.trim() === "" ? null : JSON.parse(draft.body);
      } catch {
        toast.error("Body is not valid JSON");
        setRunState("idle");
        return;
      }
      let extraHeaders: Record<string, string> = {};
      try {
        extraHeaders = draft.headers.trim() === "" ? {} : JSON.parse(draft.headers);
      } catch {
        toast.error("Headers is not valid JSON");
        setRunState("idle");
        return;
      }
      const r = await request<InvokeResponse>(`/api/functions/${fn.id}/invoke`, {
        method: draft.method,
        headers: { ...extraHeaders },
        body:
          draft.method === "GET" || draft.method === "HEAD"
            ? undefined
            : JSON.stringify(body ?? null),
      });
      setResult(r);
      setRunState(r.status === "success" ? "success" : "error");
      setResponseHistory((h) =>
        [
          {
            id: r.invocation_id,
            timestamp: new Date().toISOString(),
            result: r,
            input: draft.body,
            method: draft.method,
          },
          ...h,
        ].slice(0, 10),
      );
      const runsRes = await request<{ invocations: RunSummary[] }>(
        `/api/functions/${fn.id}/invocations`,
      );
      setRecentRuns(runsRes.invocations);
    } catch (e) {
      setRunState("error");
      if (e instanceof ApiError && e.status === 429) {
        const message =
          e.code === "concurrency_exceeded"
            ? "Too many concurrent executions — upgrade for more headroom"
            : e.code === "rate_limited"
              ? "Request rate exceeded — slow down or upgrade your plan"
              : "You've hit today's execution limit — upgrade to keep running";
        toast.error(message, {
          action: {
            label: "Upgrade",
            onClick: () => nav("/billing"),
          },
          duration: 8000,
        });
        return;
      }
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  async function useRunInput(invocationId: string) {
    const r = await request<{ invocation: InvocationDetail }>(`/api/invocations/${invocationId}`);
    const text = JSON.stringify(r.invocation.input, null, 2);
    setDraft((d) => ({ ...d, body: text ?? "null" }));
    toast.success("Input restored from run");
  }

  function addSavedCase() {
    if (!fn) return;
    const name = newCaseName.trim();
    if (!name) return;
    const next = saveTestCase(fn.id, {
      id: crypto.randomUUID(),
      name,
      input: draft.body,
      createdAt: new Date().toISOString(),
    });
    setSavedCases(next);
    setNewCaseName("");
    toast.success("Test case saved");
  }

  function removeSavedCase(caseId: string) {
    if (!fn) return;
    const next = deleteTestCase(fn.id, caseId);
    setSavedCases(next);
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.shiftKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        void formatCode();
        return;
      }
      if (e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save();
      }
      if (e.key === "Enter") {
        e.preventDefault();
        void run();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fn, dirty, draft]);

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (draggingResponseRef.current && rightColumnRef.current) {
        const rect = rightColumnRef.current.getBoundingClientRect();
        const px = rect.bottom - e.clientY;
        const pct = (px / rect.height) * 100;
        setResponseHeight(
          Math.max(MIN_RESPONSE_HEIGHT, Math.min(MAX_RESPONSE_HEIGHT, pct)),
        );
        return;
      }
      if (!splitContainerRef.current) return;
      const rect = splitContainerRef.current.getBoundingClientRect();
      if (draggingChatRef.current) {
        const px = rect.right - e.clientX;
        setChatWidth(Math.max(MIN_CHAT_WIDTH, Math.min(MAX_CHAT_WIDTH, px)));
        return;
      }
      if (draggingRef.current) {
        const rightEdge = chatOpen ? rect.right - chatWidth : rect.right;
        const pct = ((rightEdge - e.clientX) / rect.width) * 100;
        const clamped = Math.max(25, Math.min(75, pct));
        setSideWidth(clamped);
      }
    }
    function onUp() {
      if (draggingRef.current) {
        draggingRef.current = false;
        try {
          window.localStorage.setItem(SPLIT_KEY, String(sideWidth));
        } catch {
          /* ignore */
        }
      }
      if (draggingChatRef.current) {
        draggingChatRef.current = false;
        try {
          window.localStorage.setItem(CHAT_WIDTH_KEY, String(chatWidth));
        } catch {
          /* ignore */
        }
      }
      if (draggingResponseRef.current) {
        draggingResponseRef.current = false;
        try {
          window.localStorage.setItem(RESPONSE_HEIGHT_KEY, String(responseHeight));
        } catch {
          /* ignore */
        }
      }
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [sideWidth, chatWidth, chatOpen, responseHeight]);

  function loadResponseFromHistory(entry: ResponseHistoryEntry) {
    setResult(entry.result);
    setRunState(entry.result.status === "success" ? "success" : "error");
    toast.success("Response restored");
  }

  function handleExportCases() {
    if (!fn) return;
    if (savedCases.length === 0) {
      toast.error("No test cases to export");
      return;
    }
    exportTestCases(savedCases, fn.name);
  }

  function handleImportCases() {
    importFileRef.current?.click();
  }

  async function onImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !fn) return;
    try {
      const text = await file.text();
      const parsed = parseTestCasesFile(text);
      if (parsed.length === 0) {
        toast.error("No valid test cases in file");
        return;
      }
      let next = listSavedTestCases(fn.id);
      for (const item of parsed) {
        next = saveTestCase(fn.id, item);
      }
      setSavedCases(next);
      toast.success(`Imported ${parsed.length} test cases`);
    } catch (err) {
      toast.error(`Import failed: ${String(err)}`);
    }
  }

  if (!fn)
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Loading...
      </div>
    );

  const logsText = (result?.logs ?? []).join("\n");

  const httpConfigValue: HttpConfigValue = {
    slug: fn.slug,
    access_mode: fn.access_mode,
    enabled: fn.enabled,
    methods: fn.methods,
  };

  const accessBadge =
    fn.access_mode === "public" ? "Public" : "API key";
  const accessBadgeClass =
    "rounded bg-secondary px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-secondary-foreground";

  return (
    <div className="flex h-full flex-col bg-card text-card-foreground">
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
        {fn.access_mode === "api_key" ? (
          <Link
            to="/keys"
            className={`${accessBadgeClass} hover:bg-accent hover:text-accent-foreground`}
            title="Manage API keys"
          >
            {accessBadge}
          </Link>
        ) : (
          <span className={accessBadgeClass}>{accessBadge}</span>
        )}
        {!fn.enabled && (
          <span className="rounded bg-destructive/20 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-destructive">
            Disabled
          </span>
        )}
        {dirty && (
          <span className="rounded bg-secondary px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-secondary-foreground">
            Unsaved
          </span>
        )}
        <Button variant="outline" size="sm" onClick={() => void formatCode()} className="h-7" title="Format code (Ctrl/Cmd+Shift+F)">
          <Sparkles className="mr-1 h-4 w-4" /> Format
        </Button>
        <Button variant="outline" size="sm" onClick={() => void save()} disabled={!dirty} className="h-7">
          <Save className="mr-1 h-4 w-4" /> Save
        </Button>
        <RunButton
          state={runState}
          duration={result?.duration_ms}
          onClick={run}
          disabled={runState === "running"}
        />
        <Button variant="outline" size="sm" onClick={duplicate} className="h-7">
          <CopyPlus className="mr-1 h-4 w-4" /> Duplicate
        </Button>
        <Button
          variant={chatOpen ? "secondary" : "outline"}
          size="sm"
          onClick={() => setChatOpen((v) => !v)}
          className="h-7"
          title="AI assistant"
        >
          <Wand2 className="mr-1 h-4 w-4" /> AI
        </Button>
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

      <div ref={splitContainerRef} className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col bg-background">
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

        <div
          role="separator"
          aria-orientation="vertical"
          onMouseDown={(e) => {
            e.preventDefault();
            draggingRef.current = true;
            document.body.style.cursor = "col-resize";
            document.body.style.userSelect = "none";
          }}
          className="w-1 shrink-0 cursor-col-resize bg-border transition-colors hover:bg-primary/40"
        />
        <div
          ref={rightColumnRef}
          className="flex min-w-0 flex-col"
          style={{ width: `${sideWidth}%` }}
        >
          <div className="flex min-h-0 flex-1 flex-col">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex min-h-0 flex-1 flex-col">
              <OverflowTabsList
                value={activeTab}
                onValueChange={setActiveTab}
                items={[
                  { value: "request", label: "Request" },
                  { value: "config", label: "HTTP" },
                  { value: "triggers", label: "Triggers" },
                  { value: "env", label: "Env" },
                  {
                    value: "deps",
                    label: (
                      <>
                        Deps
                        {fn.build_status === "error" && (
                          <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-destructive" />
                        )}
                      </>
                    ),
                  },
                  { value: "logs", label: "Logs" },
                  { value: "info", label: "Info" },
                  { value: "runs", label: "Runs" },
                  { value: "versions", label: "Versions" },
                ] satisfies OverflowTabItem[]}
              />

              <TabsContent value="request" className="mt-0 min-h-0 flex-1 overflow-hidden p-0">
                <div className="flex h-full min-h-0 flex-col bg-background">
                  <input
                    ref={importFileRef}
                    type="file"
                    accept="application/json"
                    className="hidden"
                    onChange={onImportFile}
                  />
                  <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
                    <input
                      className="h-8 min-w-0 flex-1 rounded border border-border bg-card px-2 text-sm text-foreground outline-none"
                      placeholder="Save current body as test case"
                      value={newCaseName}
                      onChange={(e) => setNewCaseName(e.target.value)}
                    />
                    <Button size="sm" className="h-8" onClick={addSavedCase} disabled={!newCaseName.trim()}>
                      Save case
                    </Button>
                    <Button variant="ghost" size="sm" className="h-8 px-2" onClick={handleImportCases} title="Import test cases from JSON">
                      <Upload className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-8 px-2" onClick={handleExportCases} title="Export test cases to JSON" disabled={savedCases.length === 0}>
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  {savedCases.length > 0 && (
                    <div className="border-b border-border px-3 py-2">
                      <div className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                        Saved test cases
                      </div>
                      <div className="space-y-2">
                        {savedCases.map((item) => (
                          <div key={item.id} className="flex items-center gap-2 rounded border border-border bg-card px-2 py-2 text-sm">
                            <button
                              type="button"
                              className="min-w-0 flex-1 truncate text-left text-foreground hover:text-primary"
                              onClick={() => setDraft((d) => ({ ...d, body: item.input }))}
                            >
                              {item.name}
                            </button>
                            <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setDraft((d) => ({ ...d, body: item.input }))}>
                              Load
                            </Button>
                            <Button variant="ghost" size="sm" className="h-7 px-2 text-muted-foreground" onClick={() => removeSavedCase(item.id)}>
                              Delete
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="min-h-0 flex-1">
                    <HttpRequestEditor
                      value={draft}
                      allowedMethods={fn.methods as HttpMethod[]}
                      onChange={setDraft}
                    />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="config" className="mt-0 min-h-0 flex-1 overflow-auto bg-background p-4">
                <HttpConfigPanel
                  value={httpConfigValue}
                  onChange={(next) => {
                    setFn({
                      ...fn,
                      slug: next.slug,
                      access_mode: next.access_mode,
                      enabled: next.enabled,
                      methods: next.methods,
                    });
                    setDirty(true);
                  }}
                />
              </TabsContent>

              <TabsContent value="triggers" className="mt-0 min-h-0 flex-1 overflow-auto bg-background p-4">
                <div className="space-y-8">
                  <SchedulesPanel functionId={fn.id} />
                  <div className="h-px bg-border" />
                  <WebhookVerifyPanel fn={fn} onUpdated={setFn} />
                  <div className="h-px bg-border" />
                  <TriggerEventsPanel functionId={fn.id} />
                </div>
              </TabsContent>

              <TabsContent value="env" className="mt-0 min-h-0 flex-1 overflow-auto bg-background p-4">
                <EnvVarsPanel functionId={fn.id} />
              </TabsContent>

              <TabsContent value="deps" className="mt-0 min-h-0 flex-1 overflow-auto bg-background p-4">
                <DependenciesPanel
                  dependencies={fn.dependencies ?? {}}
                  buildStatus={fn.build_status}
                  buildError={fn.build_error}
                  builtAt={fn.built_at}
                  onChange={(next) => {
                    setFn({ ...fn, dependencies: next });
                    setDirty(true);
                  }}
                />
              </TabsContent>

              <TabsContent value="logs" className="mt-0 min-h-0 flex-1 overflow-auto bg-background p-0">
                <div className="flex items-center justify-end border-b border-border px-3 py-2">
                  <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => copyText("Logs", logsText)}>
                    <Copy className="mr-1 h-3.5 w-3.5" /> Copy logs
                  </Button>
                </div>
                <pre className="h-full w-full p-3 font-mono text-xs text-foreground">
                  {logsText || "No logs yet."}
                </pre>
              </TabsContent>

              <TabsContent value="info" className="mt-0 min-h-0 flex-1 overflow-auto bg-background p-4 text-xs text-muted-foreground">
                <div className="space-y-4">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
                      Function ID
                    </div>
                    <div className="mt-1 font-mono text-foreground">{fn.id}</div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-wider text-muted-foreground/70">
                      <span>Endpoint URL</span>
                      {endpointUrl && (
                        <Button variant="ghost" size="sm" className="h-6 px-2" onClick={() => copyText("Endpoint URL", endpointUrl)}>
                          <Copy className="mr-1 h-3.5 w-3.5" /> Copy
                        </Button>
                      )}
                    </div>
                    <div className="mt-1 break-all font-mono text-foreground">
                      {endpointUrl || <span className="text-muted-foreground">set a slug in the HTTP tab</span>}
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-wider text-muted-foreground/70">
                      <span>Curl</span>
                      <Button variant="ghost" size="sm" className="h-6 px-2" onClick={() => copyText("Curl command", curlSnippet)}>
                        <Copy className="mr-1 h-3.5 w-3.5" /> Copy
                      </Button>
                    </div>
                    <pre className="mt-1 overflow-auto rounded border border-border bg-card p-3 font-mono text-foreground">
                      {curlSnippet || (
                        <span className="text-muted-foreground">set a slug in the HTTP tab</span>
                      )}
                    </pre>
                  </div>
                  <div className="text-muted-foreground/70">
                    Shortcuts: <span className="text-foreground">Ctrl/Cmd+S</span> to save, <span className="text-foreground">Ctrl/Cmd+Enter</span> to run.
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="runs" className="mt-0 min-h-0 flex-1 overflow-auto bg-background p-0">
                {recentRuns.length === 0 ? (
                  <div className="p-4 text-sm text-muted-foreground">No runs yet.</div>
                ) : (
                  <div className="divide-y divide-border">
                    {recentRuns.map((r) => (
                      <div key={r.id} className="flex items-center gap-3 px-3 py-3 text-sm">
                        <StatusDot status={r.status} />
                        <button
                          type="button"
                          className="min-w-0 flex-1 truncate text-left text-foreground hover:text-primary"
                          onClick={() => nav(`/runs/${r.id}`)}
                        >
                          <span className="font-mono text-muted-foreground">{r.request_method ?? "POST"}</span>{" "}
                          {relTime(r.started_at)}
                        </button>
                        {r.version_number != null && (
                          <span className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-secondary-foreground">
                            v{r.version_number}
                          </span>
                        )}
                        {r.response_status != null && (
                          <span className="font-mono text-xs text-muted-foreground">{r.response_status}</span>
                        )}
                        <span className="font-mono text-xs text-muted-foreground">{r.duration_ms}ms</span>
                        <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => void useRunInput(r.id)}>
                          Use input
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="versions" className="mt-0 min-h-0 flex-1 overflow-auto bg-background p-0">
                {versions.length === 0 ? (
                  <div className="p-4 text-sm text-muted-foreground">No versions yet.</div>
                ) : (
                  <div className="divide-y divide-border">
                    {versions.map((v) => {
                      const isCurrent = v.id === fn.current_version_id;
                      return (
                        <div key={v.id} className="flex items-center gap-3 px-3 py-3 text-sm">
                          <span className="rounded bg-secondary px-2 py-0.5 font-mono text-[11px] text-secondary-foreground">
                            v{v.version_number}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-foreground">
                              {new Date(v.created_at).toLocaleString()}
                            </div>
                            <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
                              {relTime(v.created_at)}
                            </div>
                          </div>
                          {isCurrent ? (
                            <span className="rounded bg-primary/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-primary">
                              Current
                            </span>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7"
                              onClick={() => void rollbackVersion(v.id)}
                            >
                              Roll back
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>

          <div
            role="separator"
            aria-orientation="horizontal"
            onMouseDown={(e) => {
              e.preventDefault();
              draggingResponseRef.current = true;
              document.body.style.cursor = "row-resize";
              document.body.style.userSelect = "none";
            }}
            className="h-1 shrink-0 cursor-row-resize bg-border transition-colors hover:bg-primary/40"
          />
          <div
            className="flex min-h-0 shrink-0 flex-col"
            style={{ height: `${responseHeight}%` }}
          >
            <div className="flex h-8 shrink-0 items-center gap-2 border-b border-border bg-muted/20 px-3 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              <span>Response</span>
              <div className="flex-1" />
              {responseHistory.length > 0 && (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-6 px-2">
                      <HistoryIcon className="mr-1 h-3.5 w-3.5" /> History ({responseHistory.length})
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-80 p-0">
                    <div className="max-h-72 overflow-auto divide-y divide-border">
                      {responseHistory.map((entry) => (
                        <button
                          key={entry.id}
                          type="button"
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-accent"
                          onClick={() => loadResponseFromHistory(entry)}
                        >
                          <StatusDot status={entry.result.status} />
                          <span className="font-mono text-muted-foreground">{entry.method}</span>
                          <span className="flex-1 truncate text-foreground">
                            {new Date(entry.timestamp).toLocaleTimeString()}
                          </span>
                          <span className="font-mono text-muted-foreground">
                            {entry.result.duration_ms}ms
                          </span>
                        </button>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              )}
              {result?.response && (
                <Button variant="ghost" size="sm" className="h-6 px-2" onClick={() => copyText("Body", result.response!.body)}>
                  <Copy className="mr-1 h-3.5 w-3.5" /> Copy body
                </Button>
              )}
              {result && result.status !== "success" && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2"
                  onClick={() => copyText("Error", result.error ?? "")}
                >
                  <Copy className="mr-1 h-3.5 w-3.5" /> Copy error
                </Button>
              )}
              {result && (
                <Button variant="ghost" size="sm" className="h-6 px-2" onClick={() => nav(`/runs/${result.invocation_id}`)}>
                  <Play className="mr-1 h-3.5 w-3.5" /> Open run
                </Button>
              )}
            </div>
            <div className="min-h-0 flex-1 overflow-auto bg-background">
              <HttpResponseView result={result} />
            </div>
          </div>
        </div>

        {chatOpen && (
          <>
            <div
              role="separator"
              aria-orientation="vertical"
              onMouseDown={(e) => {
                e.preventDefault();
                draggingChatRef.current = true;
                document.body.style.cursor = "col-resize";
                document.body.style.userSelect = "none";
              }}
              className="w-1 shrink-0 cursor-col-resize bg-border transition-colors hover:bg-primary/40"
            />
            <div
              className="flex min-h-0 shrink-0 flex-col"
              style={{ width: `${chatWidth}px` }}
            >
              <AiChatPanel
                currentCode={fn.code}
                onApplyCode={(code) => {
                  setFn({ ...fn, code });
                  setDirty(true);
                }}
                onClose={() => setChatOpen(false)}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
