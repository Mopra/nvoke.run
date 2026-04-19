import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { clerkAuth } from "../auth.js";
import { config } from "../config.js";

const GenerateBody = z.object({
  prompt: z.string().min(1).max(4000),
  currentCode: z.string().max(100_000).default(""),
});

const MODEL = "openai/gpt-5.4-nano";

const SYSTEM_PROMPT = `You are an AI assistant embedded in a web-based serverless function editor.

The user is editing a single JavaScript file that exports a default async handler:
  export default async function handler(req) { ... }

req has: body (parsed JSON), headers, method, query. Return any serializable value — it becomes the HTTP response body. Returning { status, body } sets the HTTP status.

Respond with strict JSON matching this schema:
  { "text": string, "code"?: string }

- "text" is a short explanation shown as chat prose. Keep it concise (1-3 sentences).
- "code" is the complete new file contents. Include it whenever the user asks you to write, modify, refactor, or fix code. Omit it for pure questions or explanations.
- Never wrap "code" in markdown fences. It must be raw JavaScript that can be pasted directly into the editor.`;

interface OpenRouterResponse {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
}

export async function aiRoutes(app: FastifyInstance) {
  app.addHook("preHandler", clerkAuth);

  app.post("/api/ai/generate", async (req, reply) => {
    if (!config.OPENROUTER_API_KEY) {
      return reply
        .code(503)
        .send({ error: "ai_unavailable", message: "AI is not configured on this server" });
    }

    const { prompt, currentCode } = GenerateBody.parse(req.body);

    const userMessage = currentCode.trim()
      ? `Current file contents:\n\n\`\`\`js\n${currentCode}\n\`\`\`\n\nRequest: ${prompt}`
      : `The editor is empty.\n\nRequest: ${prompt}`;

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
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userMessage },
          ],
          response_format: { type: "json_object" },
        }),
      });
    } catch (err) {
      req.log.error({ err }, "openrouter fetch failed");
      return reply
        .code(502)
        .send({ error: "upstream_unreachable", message: "could not reach AI provider" });
    }

    const data = (await upstream.json().catch(() => null)) as OpenRouterResponse | null;

    if (!upstream.ok || !data) {
      req.log.warn({ status: upstream.status, data }, "openrouter error");
      return reply.code(502).send({
        error: "upstream_error",
        message: data?.error?.message ?? `AI provider returned ${upstream.status}`,
      });
    }

    const raw = data.choices?.[0]?.message?.content?.trim();
    if (!raw) {
      return reply
        .code(502)
        .send({ error: "empty_response", message: "AI returned an empty response" });
    }

    let parsed: { text?: unknown; code?: unknown };
    try {
      parsed = JSON.parse(raw);
    } catch {
      return reply.code(502).send({
        error: "invalid_response",
        message: "AI did not return valid JSON",
      });
    }

    const text = typeof parsed.text === "string" ? parsed.text : "";
    const code = typeof parsed.code === "string" && parsed.code.trim() ? parsed.code : undefined;

    if (!text && !code) {
      return reply
        .code(502)
        .send({ error: "invalid_response", message: "AI response missing text and code" });
    }

    return { text, code };
  });
}
