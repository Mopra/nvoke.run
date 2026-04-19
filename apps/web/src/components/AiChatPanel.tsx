import { useEffect, useRef, useState } from "react";
import { Check, Copy, Send, Sparkles, User, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useApi } from "@/lib/api";

interface Props {
  currentCode: string;
  onApplyCode: (code: string) => void;
  onClose: () => void;
}

type Role = "user" | "assistant";

interface Message {
  id: string;
  role: Role;
  text: string;
  code?: string;
  pending?: boolean;
}

const SUGGESTIONS = [
  "Write a hello world function",
  "Add error handling to this function",
  "Explain this code",
  "Turn this into a Stripe webhook",
];

export function AiChatPanel({ currentCode, onApplyCode, onClose }: Props) {
  const { request } = useApi();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  async function send(text: string) {
    const prompt = text.trim();
    if (!prompt || busy) return;
    setInput("");
    setBusy(true);
    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      text: prompt,
    };
    const pendingId = crypto.randomUUID();
    setMessages((m) => [
      ...m,
      userMsg,
      { id: pendingId, role: "assistant", text: "", pending: true },
    ]);

    try {
      const { text: reply, code } = await request<{ text: string; code?: string }>(
        "/api/ai/generate",
        {
          method: "POST",
          body: JSON.stringify({ prompt, currentCode }),
        },
      );
      await streamInto(reply, (partial) => {
        setMessages((m) =>
          m.map((msg) => (msg.id === pendingId ? { ...msg, text: partial } : msg)),
        );
      });
      setMessages((m) =>
        m.map((msg) =>
          msg.id === pendingId
            ? { ...msg, text: reply, code, pending: false }
            : msg,
        ),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setMessages((m) =>
        m.map((msg) =>
          msg.id === pendingId
            ? { ...msg, text: `Error: ${message}`, pending: false }
            : msg,
        ),
      );
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send(input);
    }
  }

  function copyMsg(text: string) {
    navigator.clipboard.writeText(text);
    toast.success("Copied");
  }

  function apply(code: string) {
    onApplyCode(code);
    toast.success("Applied to editor");
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-border bg-muted/20 px-3 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        <Sparkles className="h-3.5 w-3.5 text-primary" />
        <span>AI assistant</span>
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          onClick={onClose}
          title="Close"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto px-3 py-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-primary">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-semibold text-foreground">
                Write functions with AI
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Describe what you want, or ask about the code on the left.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2 pt-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void send(s)}
                  className="rounded-full border border-border bg-muted/40 px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:bg-accent hover:text-accent-foreground"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {messages.map((m) => (
              <MessageBubble
                key={m.id}
                message={m}
                onCopy={copyMsg}
                onApply={apply}
              />
            ))}
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-border bg-muted/20 p-2">
        <div className="flex items-end gap-2 rounded-md border border-border bg-background px-2 py-1.5 focus-within:ring-2 focus-within:ring-ring">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Ask the assistant… (Enter to send, Shift+Enter for newline)"
            rows={1}
            className="min-h-[24px] flex-1 resize-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
            disabled={busy}
          />
          <Button
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => void send(input)}
            disabled={busy || !input.trim()}
          >
            <Send className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({
  message,
  onCopy,
  onApply,
}: {
  message: Message;
  onCopy: (text: string) => void;
  onApply: (code: string) => void;
}) {
  const isUser = message.role === "user";
  return (
    <div className="flex gap-2">
      <div
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
          isUser
            ? "bg-secondary text-secondary-foreground"
            : "bg-primary/15 text-primary"
        }`}
      >
        {isUser ? <User className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
          {isUser ? "You" : "Assistant"}
        </div>
        <div className="mt-1 whitespace-pre-wrap text-sm text-foreground">
          {message.text}
          {message.pending && (
            <span className="ml-1 inline-block h-3 w-1.5 translate-y-0.5 animate-pulse bg-foreground/60" />
          )}
        </div>
        {message.code && (
          <CodeBlock
            code={message.code}
            onCopy={() => onCopy(message.code!)}
            onApply={() => onApply(message.code!)}
          />
        )}
      </div>
    </div>
  );
}

function CodeBlock({
  code,
  onCopy,
  onApply,
}: {
  code: string;
  onCopy: () => void;
  onApply: () => void;
}) {
  const [applied, setApplied] = useState(false);
  return (
    <div className="mt-2 overflow-hidden rounded-md border border-border bg-card">
      <div className="flex h-7 items-center gap-2 border-b border-border bg-muted/30 px-2 text-[10px] uppercase tracking-wider text-muted-foreground">
        <span>index.js</span>
        <div className="flex-1" />
        <Button variant="ghost" size="sm" className="h-5 px-1.5 text-[10px]" onClick={onCopy}>
          <Copy className="mr-1 h-3 w-3" /> Copy
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-5 px-1.5 text-[10px] text-primary hover:text-primary"
          onClick={() => {
            onApply();
            setApplied(true);
            setTimeout(() => setApplied(false), 1500);
          }}
        >
          {applied ? (
            <>
              <Check className="mr-1 h-3 w-3" /> Applied
            </>
          ) : (
            <>
              <Sparkles className="mr-1 h-3 w-3" /> Apply
            </>
          )}
        </Button>
      </div>
      <pre className="overflow-auto p-3 font-mono text-xs text-foreground">{code}</pre>
    </div>
  );
}

async function streamInto(full: string, onChunk: (partial: string) => void) {
  const tokens = full.match(/\S+\s*|\s+/g) ?? [full];
  let acc = "";
  for (const t of tokens) {
    acc += t;
    onChunk(acc);
    await new Promise((r) => setTimeout(r, 18 + Math.random() * 30));
  }
}
