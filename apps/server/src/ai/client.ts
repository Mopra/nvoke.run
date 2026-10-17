// Claude for the server, through OpenRouter: one call shape, structured
// output, cost per account.
//
// structured() asks for a JSON answer whose schema comes from a zod schema
// (OpenRouter structured outputs, `response_format: json_schema`), then
// validates the answer with that schema. The schema sent is trimmed to what
// every provider accepts (shape, types, enums); zod still checks the rest
// (lengths, ranges, refinements).
//
// Every call is recorded with its tokens and cost (usage.ts), logged with the
// user id, and refused before it starts when the account has spent its
// monthly budget.

import type { Logger } from 'pino';
import type { Sql } from 'postgres';
import { z } from 'zod';
import { loadEnv } from '../env.js';
import { MODELS, costUsd, type ModelTier, type TokenCounts } from './models.js';
import { monthlyBudgetUsd, recordUsage, spentThisMonth, type BudgetRule } from './usage.js';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

/** The request body nvoke sends to OpenRouter's chat completions. */
export interface ChatRequest {
  model: string;
  max_tokens: number;
  messages: { role: 'system' | 'user'; content: string }[];
  response_format: {
    type: 'json_schema';
    json_schema: { name: string; description: string; strict: boolean; schema: Record<string, unknown> };
  };
  reasoning?: { effort: 'low' | 'medium' | 'high' };
}

/** The parts of OpenRouter's answer nvoke reads. */
export interface ChatResponse {
  model: string;
  choices: {
    finish_reason: string | null;
    message: { content: string | null; refusal?: string | null };
  }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    /** USD charged by OpenRouter for the call. */
    cost?: number;
    prompt_tokens_details?: { cached_tokens?: number; cache_write_tokens?: number };
  };
}

/** Sends one chat request, so tests can pass a fake. */
export interface ChatClient {
  complete(body: ChatRequest): Promise<ChatResponse>;
}

export type AiErrorCode =
  /** No OPENROUTER_API_KEY. */
  | 'unavailable'
  /** The account spent its monthly Claude budget. */
  | 'budget_exceeded'
  /** Claude declined the request. */
  | 'refusal'
  /** Claude answered without JSON, or ran out of tokens. */
  | 'no_output'
  /** The answer failed the zod schema. */
  | 'invalid_output';

export class AiError extends Error {
  constructor(
    readonly code: AiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AiError';
  }
}

export interface StructuredRequest<S extends z.ZodType> {
  /** Who the call is for: their account pays and is capped. */
  userId: string;
  /** What the call is for, kept in ai_usage and the log, for example "opener". */
  task: string;
  tier: ModelTier;
  system: string;
  prompt: string;
  /** The answer's shape. Must be an object schema. */
  schema: S;
  /** Names the answer's schema, for example "save_profile". */
  toolName: string;
  toolDescription: string;
  maxTokens?: number;
  effort?: 'low' | 'medium' | 'high';
}

export interface StructuredResult<T> {
  data: T;
  model: string;
  usage: TokenCounts;
  costUsd: number;
}

export interface Ai {
  structured<S extends z.ZodType>(req: StructuredRequest<S>): Promise<StructuredResult<z.infer<S>>>;
  /** Whether a call for the account would be made now: a key is set and the monthly budget is not spent. */
  ready(userId: string): Promise<boolean>;
}

export interface AiOptions {
  sql: Sql;
  log: Logger;
  budget: BudgetRule;
  apiKey?: string;
  /** Replaces the OpenRouter client built from apiKey. Tests pass a fake. */
  client?: ChatClient;
  now?: () => Date;
}

/** The OpenRouter client over fetch. */
export function openRouterClient(apiKey: string): ChatClient {
  return {
    async complete(body) {
      const res = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
          'http-referer': 'https://nvoke.run',
          'x-title': 'nvoke',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(120_000),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`OpenRouter answered ${res.status}: ${text.slice(0, 300)}`);
      }
      return (await res.json()) as ChatResponse;
    },
  };
}

// Keywords structured outputs accept everywhere. The limits below are dropped
// from the schema, told to the model in the description instead, and checked
// by zod afterwards.
const KEEP = new Set(['type', 'properties', 'required', 'items', 'enum', 'const', 'anyOf', 'description', 'additionalProperties', '$defs', '$ref']);
const HINTS: Record<string, (v: unknown) => string> = {
  minItems: (v) => `At least ${String(v)} items.`,
  maxItems: (v) => `At most ${String(v)} items.`,
  minLength: (v) => `At least ${String(v)} characters.`,
  maxLength: (v) => `At most ${String(v)} characters.`,
  minimum: (v) => `At least ${String(v)}.`,
  maximum: (v) => `At most ${String(v)}.`,
  pattern: (v) => `Matches ${String(v)}.`,
};

function trimSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(trimSchema);
  if (!node || typeof node !== 'object') return node;
  const out: Record<string, unknown> = {};
  const hints: string[] = [];
  for (const [key, value] of Object.entries(node)) {
    const hint = HINTS[key];
    if (hint) hints.push(hint(value));
    if (!KEEP.has(key)) continue;
    if (key === 'properties' || key === '$defs') {
      out[key] = Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, trimSchema(v)]));
    } else {
      out[key] = trimSchema(value);
    }
  }
  if (hints.length) out.description = [out.description, ...hints].filter(Boolean).join(' ');
  if (out.type === 'object') out.additionalProperties = false;
  return out;
}

/** The JSON schema sent for a zod schema. */
export function answerSchema(schema: z.ZodType): Record<string, unknown> {
  return trimSchema(z.toJSONSchema(schema, { io: 'output', unrepresentable: 'any' })) as Record<string, unknown>;
}

export function createAi(opts: AiOptions): Ai {
  const client: ChatClient | undefined = opts.client ?? (opts.apiKey ? openRouterClient(opts.apiKey) : undefined);
  const now = opts.now ?? (() => new Date());

  return {
    async ready(userId) {
      if (!client) return false;
      const [spent, budget] = await Promise.all([spentThisMonth(opts.sql, userId, now()), monthlyBudgetUsd(opts.sql, userId, opts.budget)]);
      return spent < budget;
    },

    async structured(req) {
      if (!client) throw new AiError('unavailable', 'Claude is not configured (OPENROUTER_API_KEY)');

      const at = now();
      const [spent, budget] = await Promise.all([
        spentThisMonth(opts.sql, req.userId, at),
        monthlyBudgetUsd(opts.sql, req.userId, opts.budget),
      ]);
      if (spent >= budget) {
        opts.log.warn({ userId: req.userId, task: req.task, spentUsd: spent, budgetUsd: budget }, 'ai: monthly budget spent');
        throw new AiError('budget_exceeded', 'The monthly Claude budget for this account is spent');
      }

      const response = await client.complete({
        model: MODELS[req.tier],
        max_tokens: req.maxTokens ?? 4096,
        messages: [
          { role: 'system', content: `${req.system}\n\nAnswer only with JSON that matches the ${req.toolName} schema.` },
          { role: 'user', content: req.prompt },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: { name: req.toolName, description: req.toolDescription, strict: true, schema: answerSchema(req.schema) },
        },
        ...(req.effort ? { reasoning: { effort: req.effort } } : {}),
      });

      const usage: TokenCounts = {
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
        cacheReadTokens: response.usage?.prompt_tokens_details?.cached_tokens ?? 0,
        cacheWriteTokens: response.usage?.prompt_tokens_details?.cache_write_tokens ?? 0,
      };
      // OpenRouter reports what it charged; the price table is the fallback.
      const cost = typeof response.usage?.cost === 'number' ? response.usage.cost : costUsd(response.model, usage);
      await recordUsage(opts.sql, { userId: req.userId, task: req.task, model: response.model, costUsd: cost, ...usage }, at);

      const choice = response.choices[0];
      opts.log.info(
        { userId: req.userId, task: req.task, model: response.model, ...usage, costUsd: cost, finishReason: choice?.finish_reason },
        'ai: call',
      );

      if (choice?.message.refusal || choice?.finish_reason === 'content_filter') {
        throw new AiError('refusal', `Claude declined: ${choice.message.refusal ?? 'content filter'}`);
      }
      const content = choice?.message.content;
      if (!content || choice.finish_reason === 'length') {
        throw new AiError('no_output', `Claude gave no ${req.toolName} answer (finish: ${choice?.finish_reason ?? 'none'})`);
      }
      let json: unknown;
      try {
        json = JSON.parse(content);
      } catch {
        throw new AiError('no_output', `Claude's ${req.toolName} answer is not JSON`);
      }

      const parsed = req.schema.safeParse(json);
      if (!parsed.success) {
        opts.log.warn({ userId: req.userId, task: req.task, issues: parsed.error.issues.slice(0, 5) }, 'ai: invalid output');
        throw new AiError('invalid_output', `Claude's ${req.toolName} answer failed validation`);
      }
      return { data: parsed.data, model: response.model, usage, costUsd: cost };
    },
  };
}

/** createAi with the key and budget from the environment. */
export function createAiFromEnv(sql: Sql, log: Logger): Ai {
  const env = loadEnv();
  return createAi({
    sql,
    log,
    apiKey: env.OPENROUTER_API_KEY,
    budget: { floorUsd: env.AI_MONTHLY_BUDGET_FLOOR_USD, priceShare: env.AI_MONTHLY_BUDGET_PRICE_SHARE },
  });
}
