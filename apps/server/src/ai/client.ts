// Claude for the server: one call shape, structured output, cost per account.
//
// structured() asks Claude to answer through a single tool whose input schema
// comes from a zod schema, then validates the tool input with that schema.
// The tool is strict, so the input matches the schema's shape; zod still
// checks what JSON Schema cannot (lengths, ranges, refinements). Forced
// tool_choice is a 400 on the current models, so the prompt asks for the
// tool and a reply without it is an error.
//
// Every call is recorded with its tokens and cost (usage.ts), logged with the
// user id, and refused before it starts when the account has spent its
// monthly budget.

import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { Logger } from 'pino';
import type { Sql } from 'postgres';
import type { z } from 'zod';
import { loadEnv } from '../env.js';
import { MODELS, costUsd, type ModelTier, type TokenCounts } from './models.js';
import { monthlyBudgetUsd, recordUsage, spentThisMonth, type BudgetRule } from './usage.js';

/** The part of the Anthropic client nvoke uses, so tests can pass a fake. */
export interface MessagesClient {
  messages: {
    create(body: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message>;
  };
}

export type AiErrorCode =
  /** No ANTHROPIC_API_KEY. */
  | 'unavailable'
  /** The account spent its monthly Claude budget. */
  | 'budget_exceeded'
  /** Claude declined the request. */
  | 'refusal'
  /** Claude answered without calling the tool, or ran out of tokens. */
  | 'no_output'
  /** The tool input failed the zod schema. */
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
  prompt: string | Anthropic.ContentBlockParam[];
  /** The answer's shape. Must be an object schema. */
  schema: S;
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
}

export interface AiOptions {
  sql: Sql;
  log: Logger;
  budget: BudgetRule;
  apiKey?: string;
  /** Replaces the Anthropic client built from apiKey. Tests pass a fake. */
  client?: MessagesClient;
  now?: () => Date;
}

export function createAi(opts: AiOptions): Ai {
  const client: MessagesClient | undefined = opts.client ?? (opts.apiKey ? new Anthropic({ apiKey: opts.apiKey }) : undefined);
  const now = opts.now ?? (() => new Date());

  return {
    async structured(req) {
      if (!client) throw new AiError('unavailable', 'Claude is not configured (ANTHROPIC_API_KEY)');

      const at = now();
      const [spent, budget] = await Promise.all([
        spentThisMonth(opts.sql, req.userId, at),
        monthlyBudgetUsd(opts.sql, req.userId, opts.budget),
      ]);
      if (spent >= budget) {
        opts.log.warn({ userId: req.userId, task: req.task, spentUsd: spent, budgetUsd: budget }, 'ai: monthly budget spent');
        throw new AiError('budget_exceeded', 'The monthly Claude budget for this account is spent');
      }

      const model = MODELS[req.tier];
      const response = await client.messages.create({
        model,
        max_tokens: req.maxTokens ?? 4096,
        system: `${req.system}\n\nAnswer only by calling the ${req.toolName} tool, once.`,
        messages: [{ role: 'user', content: req.prompt }],
        tools: [
          {
            name: req.toolName,
            description: req.toolDescription,
            input_schema: zodOutputFormat(req.schema).schema as Anthropic.Tool.InputSchema,
            strict: true,
          },
        ],
        ...(req.effort ? { output_config: { effort: req.effort } } : {}),
      });

      const usage: TokenCounts = {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
        cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0,
      };
      const cost = costUsd(response.model, usage);
      await recordUsage(opts.sql, { userId: req.userId, task: req.task, model: response.model, costUsd: cost, ...usage }, at);
      opts.log.info(
        { userId: req.userId, task: req.task, model: response.model, ...usage, costUsd: cost, stopReason: response.stop_reason },
        'ai: call',
      );

      if (response.stop_reason === 'refusal') {
        throw new AiError('refusal', `Claude declined: ${response.stop_details?.category ?? 'no category'}`);
      }
      const call = response.content.find(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === req.toolName,
      );
      if (!call) throw new AiError('no_output', `Claude did not call ${req.toolName} (stop: ${response.stop_reason})`);

      const parsed = req.schema.safeParse(call.input);
      if (!parsed.success) {
        opts.log.warn({ userId: req.userId, task: req.task, issues: parsed.error.issues.slice(0, 5) }, 'ai: invalid output');
        throw new AiError('invalid_output', `Claude's ${req.toolName} input failed validation`);
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
    apiKey: env.ANTHROPIC_API_KEY,
    budget: { floorUsd: env.AI_MONTHLY_BUDGET_FLOOR_USD, priceShare: env.AI_MONTHLY_BUDGET_PRICE_SHARE },
  });
}
