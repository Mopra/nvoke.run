import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { clerkAuth } from "../auth.js";
import { config } from "../config.js";

const HistoryMessage = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});

const GenerateBody = z.object({
  prompt: z.string().min(1).max(4000),
  currentCode: z.string().max(25_000).default(""),
  history: z.array(HistoryMessage).max(20).default([]),
});

// Patterns for well-known secret formats. Conservative on purpose — false
// positives here block the user's request, so only match shapes that have
// essentially no legitimate reason to appear in a serverless handler.
const SECRET_PATTERNS: Array<{ name: string; re: RegExp }> = [
  { name: "Stripe live secret key", re: /\bsk_live_[0-9a-zA-Z]{16,}\b/ },
  { name: "Stripe restricted key", re: /\brk_live_[0-9a-zA-Z]{16,}\b/ },
  { name: "OpenAI API key", re: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/ },
  { name: "AWS access key ID", re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { name: "Google API key", re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: "GitHub token", re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/ },
  { name: "Slack token", re: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/ },
  { name: "nvoke API key", re: /\bnvk_[A-Za-z0-9_-]{16,}\b/ },
  { name: "PEM private key", re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/ },
];

function findSecret(text: string): string | null {
  for (const { name, re } of SECRET_PATTERNS) {
    if (re.test(text)) return name;
  }
  return null;
}

const MODEL = "openai/gpt-5.4-nano";

const SYSTEM_PROMPT = `You are an AI assistant embedded in a web-based serverless function editor.

The user is editing a single JavaScript file that exports a default async handler:
  export default async function handler(req) { ... }

req has: body (parsed JSON), headers, method, query. Return any serializable value — it becomes the HTTP response body. Returning { status, body } sets the HTTP status.

Behavior:
- When the user asks you to write, modify, refactor, or fix code, call the "edit_code" tool with the complete new file contents. Keep any accompanying chat prose short (1–2 sentences).
- When the user asks a question or only wants an explanation, reply in plain text without calling any tool.
- Never wrap code in markdown fences. The "code" argument must be raw JavaScript that can be pasted directly into the editor.`;

const TOOLS = [
  {
    type: "function",
    function: {
      name: "edit_code",
      description:
        "Replace the user's JavaScript file with new contents. Use when the user asks to write, modify, refactor, or fix code.",
      parameters: {
        type: "object",
        properties: {
          code: {
            type: "string",
            description:
              "The complete new file contents. Raw JavaScript, no markdown fences.",
          },
        },
        required: ["code"],
      },
    },
  },
];

/**
 * Decodes the `code` string out of a streaming `{"code": "..."}` tool-argument
 * payload. Emits decoded characters as they arrive so the UI can stream them
 * into the diff view without waiting for the full tool call.
 */
class CodeArgStreamer {
  private buf = "";
  private state: "seek" | "in_string" | "done" = "seek";
  private escape = false;

  append(chunk: string): string {
    this.buf += chunk;

    if (this.state === "seek") {
      const m = this.buf.match(/"code"\s*:\s*"/);
      if (!m) return "";
      this.buf = this.buf.slice(m.index! + m[0].length);
      this.state = "in_string";
    }
    if (this.state !== "in_string") return "";

    let out = "";
    let i = 0;
    while (i < this.buf.length) {
      const ch = this.buf[i]!;

      if (this.escape) {
        switch (ch) {
          case '"': out += '"'; break;
          case "\\": out += "\\"; break;
          case "/": out += "/"; break;
          case "n": out += "\n"; break;
          case "t": out += "\t"; break;
          case "r": out += "\r"; break;
          case "b": out += "\b"; break;
          case "f": out += "\f"; break;
          case "u": {
            if (i + 4 >= this.buf.length) {
              this.buf = "\\" + this.buf.slice(i);
              this.escape = false;
              return out;
            }
            out += String.fromCharCode(
              parseInt(this.buf.slice(i + 1, i + 5), 16),
            );
            i += 4;
            break;
          }
          default:
            out += ch;
        }
        this.escape = false;
        i++;
        continue;
      }

      if (ch === "\\") {
        if (i === this.buf.length - 1) {
          this.buf = "\\";
          return out;
        }
        this.escape = true;
        i++;
        continue;
      }

      if (ch === '"') {
        this.state = "done";
        this.buf = "";
        return out;
      }

      out += ch;
      i++;
    }

    this.buf = "";
    return out;
  }
}

interface UpstreamDelta {
  content?: string;
  tool_calls?: Array<{
    index?: number;
    id?: string;
    function?: { name?: string; arguments?: string };
  }>;
}

interface UpstreamEvent {
  choices?: Array<{ delta?: UpstreamDelta }>;
}

export async function aiRoutes(app: FastifyInstance) {
  app.addHook("preHandler", clerkAuth);

  app.post("/api/ai/generate", async (req, reply) => {
    if (!config.OPENROUTER_API_KEY) {
      return reply
        .code(503)
        .send({
          error: "ai_unavailable",
          message: "AI is not configured on this server",
        });
    }

    const { prompt, currentCode, history } = GenerateBody.parse(req.body);

    const hit =
      findSecret(prompt) ??
      findSecret(currentCode) ??
      history.map((h) => findSecret(h.content)).find((v): v is string => v !== null) ??
      null;
    if (hit) {
      return reply.code(400).send({
        error: "secret_detected",
        message: `Request blocked: detected what looks like a ${hit}. Remove secrets before using the AI assistant — store them as environment variables instead.`,
      });
    }

    const userMessage = currentCode.trim()
      ? `Current file contents:\n\n\`\`\`js\n${currentCode}\n\`\`\`\n\nRequest: ${prompt}`
      : `The editor is empty.\n\nRequest: ${prompt}`;

    const messages = [
      { role: "system" as const, content: SYSTEM_PROMPT },
      ...history.map((h) => ({ role: h.role, content: h.content })),
      { role: "user" as const, content: userMessage },
    ];

    // Preserve headers Fastify has already queued (most importantly the CORS
    // headers set by @fastify/cors during onRequest) — reply.hijack() bypasses
    // the normal flush, so we have to copy them onto the raw response ourselves.
    const queuedHeaders = reply.getHeaders();
    reply.hijack();
    reply.raw.writeHead(200, {
      ...queuedHeaders,
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    });

    const send = (type: string, data: Record<string, unknown> = {}) => {
      reply.raw.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
    };

    let upstream: Response;
    try {
      upstream = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${config.OPENROUTER_API_KEY}`,
          "HTTP-Referer": "https://app.nvoke.run",
          "X-Title": "nvoke",
        },
        body: JSON.stringify({
          model: MODEL,
          messages,
          tools: TOOLS,
          stream: true,
        }),
      });
    } catch (err) {
      req.log.error({ err }, "openrouter fetch failed");
      send("error", { message: "could not reach AI provider" });
      reply.raw.end();
      return;
    }

    if (!upstream.ok || !upstream.body) {
      const text = await upstream.text().catch(() => "");
      req.log.warn({ status: upstream.status, text }, "openrouter error");
      send("error", { message: `AI provider returned ${upstream.status}` });
      reply.raw.end();
      return;
    }

    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    const codeStreamer = new CodeArgStreamer();
    let editStarted = false;
    let editToolIndex: number | null = null;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        let idx: number;
        while ((idx = buf.indexOf("\n")) !== -1) {
          const line = buf.slice(0, idx).trim();
          buf = buf.slice(idx + 1);
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;

          let event: UpstreamEvent;
          try {
            event = JSON.parse(payload) as UpstreamEvent;
          } catch {
            continue;
          }
          const delta = event.choices?.[0]?.delta;
          if (!delta) continue;

          if (typeof delta.content === "string" && delta.content) {
            send("text", { delta: delta.content });
          }

          if (Array.isArray(delta.tool_calls)) {
            for (const tc of delta.tool_calls) {
              const name = tc.function?.name;
              if (name && name !== "edit_code") continue;
              if (editToolIndex === null && (name === "edit_code" || tc.index != null)) {
                editToolIndex = tc.index ?? 0;
              }
              if (editToolIndex !== null && tc.index != null && tc.index !== editToolIndex) {
                continue;
              }
              if (!editStarted) {
                editStarted = true;
                send("edit_start");
              }
              const argChunk = tc.function?.arguments;
              if (typeof argChunk === "string" && argChunk) {
                const codeChunk = codeStreamer.append(argChunk);
                if (codeChunk) send("edit_delta", { delta: codeChunk });
              }
            }
          }
        }
      }

      if (editStarted) send("edit_end");
      send("done");
    } catch (err) {
      req.log.error({ err }, "AI streaming error");
      send("error", { message: "stream interrupted" });
    }

    reply.raw.end();
  });
}
