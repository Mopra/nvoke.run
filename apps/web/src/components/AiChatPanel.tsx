import { useEffect, useRef, useState } from "react";
import { Check, Pencil, Send, ShieldCheck, Sparkles, User, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const NOTICE_DISMISSED_KEY = "nvoke:ai-notice-dismissed";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  pending?: boolean;
  hasEdit?: boolean;
  editAccepted?: boolean;
  editRejected?: boolean;
  kind?: "reject";
}

interface Props {
  messages: ChatMessage[];
  busy: boolean;
  onSend: (text: string) => void;
  activeProposalMessageId: string | null;
  proposalStreaming: boolean;
  onAcceptProposal: () => void;
  onRejectProposal: () => void;
  onClose: () => void;
}

const SUGGESTIONS = [
  "Write a hello world function",
  "Add error handling to this function",
  "Explain this code",
  "Turn this into a Stripe webhook",
];

export function AiChatPanel({
  messages,
  busy,
  onSend,
  activeProposalMessageId,
  proposalStreaming,
  onAcceptProposal,
  onRejectProposal,
  onClose,
}: Props) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [input, setInput] = useState("");
  const [noticeDismissed, setNoticeDismissed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(NOTICE_DISMISSED_KEY) === "1";
  });

  function dismissNotice() {
    setNoticeDismissed(true);
    try {
      window.localStorage.setItem(NOTICE_DISMISSED_KEY, "1");
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  function submit(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setInput("");
    onSend(trimmed);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit(input);
    }
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

      {!noticeDismissed && (
        <div className="border-b border-border bg-muted/10 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
          <div className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <span className="text-foreground">Your prompt and the current file are sent to OpenRouter (US) for inference.</span>{" "}
              Training is disabled — providers do not retain or train on your data.{" "}
              <strong className="text-foreground">Avoid pasting personal data, customer data, or secrets.</strong>{" "}
              <a
                href="https://app.nvoke.run/privacy"
                target="_blank"
                rel="noreferrer noopener"
                className="text-primary underline-offset-2 hover:underline"
              >
                Privacy policy
              </a>
            </div>
            <button
              type="button"
              onClick={dismissNotice}
              className="text-muted-foreground/70 hover:text-foreground"
              aria-label="Dismiss notice"
              title="Dismiss"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}

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
                  onClick={() => submit(s)}
                  disabled={busy}
                  className="rounded-full border border-border bg-muted/40 px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {messages.map((m) => (
              <MessageRow
                key={m.id}
                message={m}
                isActiveProposal={m.id === activeProposalMessageId}
                proposalStreaming={proposalStreaming}
                onAcceptProposal={onAcceptProposal}
                onRejectProposal={onRejectProposal}
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
            onClick={() => submit(input)}
            disabled={busy || !input.trim()}
          >
            <Send className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

interface MessageRowProps {
  message: ChatMessage;
  isActiveProposal: boolean;
  proposalStreaming: boolean;
  onAcceptProposal: () => void;
  onRejectProposal: () => void;
}

function MessageRow({
  message,
  isActiveProposal,
  proposalStreaming,
  onAcceptProposal,
  onRejectProposal,
}: MessageRowProps) {
  if (message.role === "system" && message.kind === "reject") {
    return (
      <div className="flex items-center gap-2 rounded-md border border-dashed border-border bg-muted/20 px-2 py-1.5 text-[11px] text-muted-foreground">
        <X className="h-3 w-3" />
        <span>{message.text}</span>
      </div>
    );
  }

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
        {isUser ? (
          <User className="h-3.5 w-3.5" />
        ) : (
          <Sparkles className="h-3.5 w-3.5" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
          {isUser ? "You" : "Assistant"}
        </div>
        {message.text && (
          <div className="mt-1 whitespace-pre-wrap text-sm text-foreground">
            {message.text}
            {message.pending && !message.hasEdit && (
              <span className="ml-1 inline-block h-3 w-1.5 translate-y-0.5 animate-pulse bg-foreground/60" />
            )}
          </div>
        )}
        {message.hasEdit && (
          <EditCard
            message={message}
            isActiveProposal={isActiveProposal}
            proposalStreaming={proposalStreaming}
            onAccept={onAcceptProposal}
            onReject={onRejectProposal}
          />
        )}
      </div>
    </div>
  );
}

interface EditCardProps {
  message: ChatMessage;
  isActiveProposal: boolean;
  proposalStreaming: boolean;
  onAccept: () => void;
  onReject: () => void;
}

function EditCard({
  message,
  isActiveProposal,
  proposalStreaming,
  onAccept,
  onReject,
}: EditCardProps) {
  const streaming = isActiveProposal && proposalStreaming;
  const awaitingDecision =
    isActiveProposal && !message.editAccepted && !message.editRejected;
  const label = message.editAccepted
    ? "Applied to index.js"
    : message.editRejected
      ? "Rejected edit to index.js"
      : streaming
        ? "Editing index.js…"
        : "Proposed edit to index.js";
  const tone = message.editAccepted
    ? "text-primary"
    : message.editRejected
      ? "text-muted-foreground line-through"
      : "text-foreground";
  const Icon = message.editAccepted ? Check : Pencil;
  return (
    <div className="mt-2 overflow-hidden rounded-md border border-border bg-card">
      <div className="flex items-center gap-2 px-2 py-1.5 text-xs">
        <Icon
          className={`h-3.5 w-3.5 ${message.editAccepted ? "text-primary" : "text-muted-foreground"}`}
        />
        <span className={tone}>{label}</span>
        {streaming && (
          <span className="ml-1 inline-block h-2 w-2 animate-pulse rounded-full bg-primary" />
        )}
      </div>
      {awaitingDecision && (
        <div className="flex gap-1.5 border-t border-border bg-muted/20 p-1.5">
          <Button
            variant="outline"
            size="sm"
            className="h-7 flex-1"
            onClick={onReject}
          >
            <X className="mr-1 h-3.5 w-3.5" /> Deny
          </Button>
          <Button
            size="sm"
            className="h-7 flex-1"
            onClick={onAccept}
            disabled={streaming}
          >
            <Check className="mr-1 h-3.5 w-3.5" /> Apply
          </Button>
        </div>
      )}
    </div>
  );
}
