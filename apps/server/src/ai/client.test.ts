import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createTestDb, type TestDb } from '../testing/db.js';
import { silentLog } from '../testing/fakes.js';
import { AiError, createAi, type ChatClient, type ChatRequest, type ChatResponse } from './client.js';
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

function reply(content: unknown, over: Partial<ChatResponse> = {}, finish = 'stop'): ChatResponse {
  return {
    model: MODELS.quality,
    choices: [{ finish_reason: finish, message: { content: typeof content === 'string' || content === null ? (content as string | null) : JSON.stringify(content) } }],
    usage: { prompt_tokens: 1_000, completion_tokens: 200 },
    ...over,
  };
}

/** A fake OpenRouter client that answers with `res` and keeps every request. */
function fakeClient(res: ChatResponse) {
  const requests: ChatRequest[] = [];
  const client: ChatClient = {
    async complete(body) {
      requests.push(body);
      return res;
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
  it('asks for JSON in the zod schema and returns the validated answer', async () => {
    const { client, requests } = fakeClient(reply({ sells: 'leads', searches: [{ keyword: 'agencies' }] }));
    const ai = createAi({ sql: db.sql, log: silentLog, budget, client, now: () => NOW });

    const res = await ai.structured(ask);

    expect(res.data).toEqual({ sells: 'leads', searches: [{ keyword: 'agencies' }] });
    expect(res.model).toBe('anthropic/claude-sonnet-5.5');
    expect(requests).toHaveLength(1);
    const req = requests[0]!;
    expect(req.model).toBe('anthropic/claude-sonnet-5.5');
    expect(req.messages.map((m) => m.role)).toEqual(['system', 'user']);
    const format = req.response_format.json_schema;
    expect(format.name).toBe('save_profile');
    expect(format.strict).toBe(true);
    expect(format.schema).toMatchObject({ type: 'object', required: ['sells', 'searches'], additionalProperties: false });
    // Lengths and counts are left to zod.
    expect(JSON.stringify(format.schema)).not.toMatch(/minLength|maxItems|\$schema/);
    expect(format.schema).toMatchObject({ properties: { searches: { description: 'At most 3 items.' } } });
  });

  it('sends a cached prefix as its own part, marked for the cache, before the prompt', async () => {
    const { client, requests } = fakeClient(reply({ sells: 'x', searches: [] }));
    const ai = createAi({ sql: db.sql, log: silentLog, budget, client, now: () => NOW });
    await ai.structured({ ...ask, cachedPrefix: 'the brief' });
    expect(requests[0]!.messages[1]!.content).toEqual([
      { type: 'text', text: 'the brief', cache_control: { type: 'ephemeral' } },
      { type: 'text', text: ask.prompt },
    ]);
    await ai.structured(ask);
    expect(requests[1]!.messages[1]!.content).toBe(ask.prompt);
  });

  it('uses Haiku for bulk calls', async () => {
    const { client, requests } = fakeClient(reply({ sells: 'x', searches: [] }, { model: MODELS.bulk }));
    const ai = createAi({ sql: db.sql, log: silentLog, budget, client, now: () => NOW });
    await ai.structured({ ...ask, tier: 'bulk', effort: 'low' });
    expect(requests[0]!.model).toBe('anthropic/claude-haiku-5.5');
    expect(requests[0]!.reasoning).toEqual({ effort: 'low' });
  });

  it('records tokens and the cost OpenRouter reports', async () => {
    const { client } = fakeClient(reply({ sells: 'x', searches: [] }, { usage: { prompt_tokens: 1_000, completion_tokens: 200, cost: 0.0042 } }));
    const ai = createAi({ sql: db.sql, log: silentLog, budget, client, now: () => NOW });
    const res = await ai.structured(ask);

    expect(res.costUsd).toBeCloseTo(0.0042, 9);
    const rows = await db.sql`select task, model, input_tokens, output_tokens, cost_usd from ai_usage where clerk_user_id = 'u1'`;
    expect(rows).toEqual([{ task: 'site-profile', model: 'anthropic/claude-sonnet-5.5', input_tokens: 1000, output_tokens: 200, cost_usd: '0.004200' }]);
  });

  it('prices from the table when OpenRouter reports no cost', async () => {
    const { client } = fakeClient(reply({ sells: 'x', searches: [] }));
    const ai = createAi({ sql: db.sql, log: silentLog, budget, client, now: () => NOW });
    // Sonnet 5.5: 1,000 in at $2/M, 200 out at $10/M.
    expect((await ai.structured(ask)).costUsd).toBeCloseTo(0.004, 9);
  });

  it('refuses before calling once the monthly budget is spent', async () => {
    await recordUsage(db.sql, { userId: 'u1', task: 'opener', model: MODELS.bulk, costUsd: 1, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }, NOW);
    const { client, requests } = fakeClient(reply({ sells: 'x', searches: [] }));
    const ai = createAi({ sql: db.sql, log: silentLog, budget, client, now: () => NOW });

    await expect(ai.structured(ask)).rejects.toMatchObject({ code: 'budget_exceeded' });
    expect(requests).toHaveLength(0);
  });

  it('fails with invalid_output when the answer breaks the schema, and still records the cost', async () => {
    const { client } = fakeClient(reply({ sells: '', searches: [] }));
    const ai = createAi({ sql: db.sql, log: silentLog, budget, client, now: () => NOW });
    await expect(ai.structured(ask)).rejects.toMatchObject({ code: 'invalid_output' });
    expect(await spentThisMonth(db.sql, 'u1', NOW)).toBeGreaterThan(0);
  });

  it('fails with no_output on prose or a cut off answer', async () => {
    const ai1 = createAi({ sql: db.sql, log: silentLog, budget, client: fakeClient(reply('Here you go')).client, now: () => NOW });
    await expect(ai1.structured(ask)).rejects.toMatchObject({ code: 'no_output' });
    const ai2 = createAi({ sql: db.sql, log: silentLog, budget, client: fakeClient(reply('{"sells":', {}, 'length')).client, now: () => NOW });
    await expect(ai2.structured(ask)).rejects.toMatchObject({ code: 'no_output' });
  });

  it('fails with refusal when Claude declines', async () => {
    const res = reply(null);
    res.choices[0]!.message.refusal = 'not this';
    const ai = createAi({ sql: db.sql, log: silentLog, budget, client: fakeClient(res).client, now: () => NOW });
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
    await db.sql`update accounts set plan = 'emails_60000' where clerk_user_id = 'u1'`;
    expect(await monthlyBudgetUsd(db.sql, 'u1', budget)).toBeCloseTo(49.75, 6);
  });

  it('prices cache reads and writes, and an unknown model as Opus', () => {
    expect(costUsd(MODELS.bulk, { inputTokens: 1_000_000, outputTokens: 1_000_000, cacheReadTokens: 0, cacheWriteTokens: 0 })).toBeCloseTo(0.6, 9);
    expect(costUsd(MODELS.quality, { inputTokens: 0, outputTokens: 0, cacheReadTokens: 1_000_000, cacheWriteTokens: 1_000_000 })).toBeCloseTo(2.7, 9);
    expect(costUsd('anthropic/claude-unknown', { inputTokens: 1_000_000, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 })).toBe(4);
  });
});
