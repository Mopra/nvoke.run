import type Anthropic from '@anthropic-ai/sdk';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createTestDb, type TestDb } from '../testing/db.js';
import { silentLog } from '../testing/fakes.js';
import { AiError, createAi, type MessagesClient } from './client.js';
import { MODELS, costUsd } from './models.js';
import { monthlyBudgetUsd, recordUsage, spentThisMonth } from './usage.js';

let db: TestDb;

beforeAll(async () => {
  db = await createTestDb();
});
afterAll(async () => {
  await db.drop();
});
beforeEach(async () => {
  await db.sql`truncate accounts cascade`;
  await db.sql`insert into accounts (clerk_user_id) values ('u1')`;
});

const NOW = new Date('2026-10-17T12:00:00Z');
const budget = { floorUsd: 1, priceShare: 0.25 };

const Profile = z.object({
  sells: z.string().min(1),
  searches: z.array(z.object({ keyword: z.string() })).max(3),
});

function message(content: Anthropic.ContentBlock[], over: Partial<Anthropic.Message> = {}): Anthropic.Message {
  return {
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    model: MODELS.quality,
    content,
    stop_reason: 'tool_use',
    stop_sequence: null,
    stop_details: null,
    usage: {
      input_tokens: 1_000,
      output_tokens: 200,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    },
    ...over,
  } as Anthropic.Message;
}

function toolUse(input: unknown, name = 'save_profile'): Anthropic.ContentBlock {
  return { type: 'tool_use', id: 'toolu_1', name, input } as Anthropic.ContentBlock;
}

/** A fake Anthropic client that answers with `reply` and keeps every request. */
function fakeClient(reply: Anthropic.Message) {
  const requests: Anthropic.MessageCreateParamsNonStreaming[] = [];
  const client: MessagesClient = {
    messages: {
      async create(body) {
        requests.push(body);
        return reply;
      },
    },
  };
  return { client, requests };
}

const ask = {
  userId: 'u1',
  task: 'site-profile',
  tier: 'quality' as const,
  system: 'You profile companies.',
  prompt: 'nvoke.run sells leads.',
  schema: Profile,
  toolName: 'save_profile',
  toolDescription: 'Save the profile.',
};

describe('createAi().structured', () => {
  it('sends one strict tool from the zod schema and returns the validated input', async () => {
    const { client, requests } = fakeClient(message([toolUse({ sells: 'leads', searches: [{ keyword: 'agencies' }] })]));
    const ai = createAi({ sql: db.sql, log: silentLog, budget, client, now: () => NOW });

    const res = await ai.structured(ask);

    expect(res.data).toEqual({ sells: 'leads', searches: [{ keyword: 'agencies' }] });
    expect(res.model).toBe('claude-sonnet-5-5');
    expect(requests).toHaveLength(1);
    const req = requests[0]!;
    expect(req.model).toBe('claude-sonnet-5-5');
    expect(req.tool_choice).toBeUndefined();
    const tool = req.tools![0] as Anthropic.Tool;
    expect(tool.name).toBe('save_profile');
    expect(tool.strict).toBe(true);
    expect(tool.input_schema).toMatchObject({ type: 'object', required: ['sells', 'searches'], additionalProperties: false });
  });

  it('uses Haiku for bulk calls', async () => {
    const { client, requests } = fakeClient(message([toolUse({ sells: 'x', searches: [] })], { model: MODELS.bulk }));
    const ai = createAi({ sql: db.sql, log: silentLog, budget, client, now: () => NOW });
    await ai.structured({ ...ask, tier: 'bulk', effort: 'low' });
    expect(requests[0]!.model).toBe('claude-haiku-5-5');
    expect(requests[0]!.output_config).toEqual({ effort: 'low' });
  });

  it('records tokens and cost per call for the user', async () => {
    const { client } = fakeClient(message([toolUse({ sells: 'x', searches: [] })]));
    const ai = createAi({ sql: db.sql, log: silentLog, budget, client, now: () => NOW });
    const res = await ai.structured(ask);

    // Sonnet 5.5: 1,000 in at $2/M, 200 out at $10/M.
    expect(res.costUsd).toBeCloseTo(0.004, 9);
    const rows = await db.sql`select task, model, input_tokens, output_tokens, cost_usd from ai_usage where clerk_user_id = 'u1'`;
    expect(rows).toEqual([{ task: 'site-profile', model: 'claude-sonnet-5-5', input_tokens: 1000, output_tokens: 200, cost_usd: '0.004000' }]);
  });

  it('refuses before calling once the monthly budget is spent', async () => {
    await recordUsage(db.sql, { userId: 'u1', task: 'opener', model: MODELS.bulk, costUsd: 1, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }, NOW);
    const { client, requests } = fakeClient(message([toolUse({ sells: 'x', searches: [] })]));
    const ai = createAi({ sql: db.sql, log: silentLog, budget, client, now: () => NOW });

    await expect(ai.structured(ask)).rejects.toMatchObject({ code: 'budget_exceeded' });
    expect(requests).toHaveLength(0);
  });

  it('fails with invalid_output when the tool input breaks the schema, and still records the cost', async () => {
    const { client } = fakeClient(message([toolUse({ sells: '', searches: [] })]));
    const ai = createAi({ sql: db.sql, log: silentLog, budget, client, now: () => NOW });
    await expect(ai.structured(ask)).rejects.toMatchObject({ code: 'invalid_output' });
    expect(await spentThisMonth(db.sql, 'u1', NOW)).toBeGreaterThan(0);
  });

  it('fails with no_output when Claude answers in text', async () => {
    const text = { type: 'text', text: 'Here you go', citations: null } as Anthropic.ContentBlock;
    const { client } = fakeClient(message([text], { stop_reason: 'end_turn' }));
    const ai = createAi({ sql: db.sql, log: silentLog, budget, client, now: () => NOW });
    await expect(ai.structured(ask)).rejects.toMatchObject({ code: 'no_output' });
  });

  it('fails with refusal when Claude declines', async () => {
    const { client } = fakeClient(message([], { stop_reason: 'refusal' }));
    const ai = createAi({ sql: db.sql, log: silentLog, budget, client, now: () => NOW });
    await expect(ai.structured(ask)).rejects.toMatchObject({ code: 'refusal' });
  });

  it('is unavailable without a key', async () => {
    const ai = createAi({ sql: db.sql, log: silentLog, budget });
    const err = await ai.structured(ask).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AiError);
    expect((err as AiError).code).toBe('unavailable');
  });
});

describe('usage', () => {
  it('counts only the current calendar month (UTC)', async () => {
    const row = { userId: 'u1', task: 'opener', model: MODELS.bulk, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
    await recordUsage(db.sql, { ...row, costUsd: 0.5 }, new Date('2026-09-30T23:59:00Z'));
    await recordUsage(db.sql, { ...row, costUsd: 0.25 }, new Date('2026-10-01T00:00:00Z'));
    await recordUsage(db.sql, { ...row, costUsd: 0.125 }, NOW);
    expect(await spentThisMonth(db.sql, 'u1', NOW)).toBeCloseTo(0.375, 6);
  });

  it('gives the free plan the floor and paid plans a share of their price', async () => {
    expect(await monthlyBudgetUsd(db.sql, 'u1', budget)).toBe(1);
    await db.sql`update accounts set plan = 'emails_100000' where clerk_user_id = 'u1'`;
    expect(await monthlyBudgetUsd(db.sql, 'u1', budget)).toBeCloseTo(37.25, 6);
  });

  it('prices cache reads and writes, and an unknown model as Opus', () => {
    expect(costUsd(MODELS.bulk, { inputTokens: 1_000_000, outputTokens: 1_000_000, cacheReadTokens: 0, cacheWriteTokens: 0 })).toBeCloseTo(0.6, 9);
    expect(costUsd(MODELS.quality, { inputTokens: 0, outputTokens: 0, cacheReadTokens: 1_000_000, cacheWriteTokens: 1_000_000 })).toBeCloseTo(2.7, 9);
    expect(costUsd('claude-unknown', { inputTokens: 1_000_000, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 })).toBe(4);
  });
});
