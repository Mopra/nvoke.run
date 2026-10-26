import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import { anthropicClient, checkKey, fromMessage, toMessages, type AnthropicSdk } from './anthropic.js';
import { AiError, type ChatRequest } from './client.js';

const schema = { type: 'object', properties: { sells: { type: 'string' } }, required: ['sells'], additionalProperties: false };

const request: ChatRequest = {
  model: 'claude-sonnet-5-5',
  max_tokens: 1024,
  messages: [
    { role: 'system', content: 'You profile companies.' },
    {
      role: 'user',
      content: [
        { type: 'text', text: 'the brief', cache_control: { type: 'ephemeral' } },
        { type: 'text', text: 'nvoke.run sells leads.' },
      ],
    },
  ],
  response_format: { type: 'json_schema', json_schema: { name: 'save_profile', description: 'Save it.', strict: true, schema } },
  reasoning: { effort: 'low' },
};

/** A Messages API answer with only the fields fromMessage reads. */
function message(over: Partial<Anthropic.Message> = {}): Anthropic.Message {
  return {
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    model: 'claude-sonnet-5-5',
    content: [{ type: 'text', text: '{"sells":', citations: null }, { type: 'text', text: '"leads"}', citations: null }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    stop_details: null,
    usage: { input_tokens: 1_000, output_tokens: 200, cache_read_input_tokens: 300, cache_creation_input_tokens: 50 },
    ...over,
  } as unknown as Anthropic.Message;
}

const headers = new Headers();
const authError = () => new Anthropic.AuthenticationError(401, { type: 'authentication_error' }, 'invalid x-api-key', headers);
const notFound = () => new Anthropic.NotFoundError(404, { type: 'not_found_error' }, 'model not found', headers);

/** A fake SDK: `create` and `retrieve` answer or throw as told, and calls are kept. */
function fakeSdk(opts: { create?: () => Anthropic.Message; retrieve?: (id: string) => unknown } = {}) {
  const created: Anthropic.MessageCreateParamsNonStreaming[] = [];
  const retrieved: string[] = [];
  const sdk: AnthropicSdk = {
    messages: {
      async create(body) {
        created.push(body);
        return (opts.create ?? (() => message()))();
      },
    },
    models: {
      async retrieve(id) {
        retrieved.push(id);
        return (opts.retrieve ?? ((m: string) => ({ id: m })))(id);
      },
    },
  };
  return { sdk, created, retrieved };
}

describe('toMessages', () => {
  it('maps the system prompt, the cached prefix parts, the schema and the effort', () => {
    expect(toMessages(request)).toEqual({
      model: 'claude-sonnet-5-5',
      max_tokens: 1024,
      system: 'You profile companies.',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'the brief', cache_control: { type: 'ephemeral' } },
            { type: 'text', text: 'nvoke.run sells leads.' },
          ],
        },
      ],
      output_config: { format: { type: 'json_schema', schema }, effort: 'low' },
    });
  });

  it('leaves out effort without reasoning and keeps a plain string prompt', () => {
    const body = toMessages({ ...request, reasoning: undefined, messages: [request.messages[0]!, { role: 'user', content: 'hi' }] });
    expect(body.output_config).toEqual({ format: { type: 'json_schema', schema } });
    expect(body.messages).toEqual([{ role: 'user', content: 'hi' }]);
  });
});

describe('fromMessage', () => {
  it('joins the text blocks and maps the usage, cache reads and writes apart', () => {
    expect(fromMessage(message())).toEqual({
      model: 'claude-sonnet-5-5',
      choices: [{ finish_reason: 'stop', message: { content: '{"sells":"leads"}', refusal: null } }],
      usage: { prompt_tokens: 1_000, completion_tokens: 200, prompt_tokens_details: { cached_tokens: 300, cache_write_tokens: 50 } },
    });
  });

  it('turns max_tokens into length', () => {
    expect(fromMessage(message({ stop_reason: 'max_tokens' })).choices[0]!.finish_reason).toBe('length');
  });

  it('turns a refusal into a refusal with no content', () => {
    const res = fromMessage(message({ stop_reason: 'refusal', stop_details: { type: 'refusal', category: 'cyber', explanation: 'not this' } as never }));
    expect(res.choices[0]).toEqual({ finish_reason: 'content_filter', message: { content: null, refusal: 'not this' } });
    expect(fromMessage(message({ stop_reason: 'refusal' })).choices[0]!.message.refusal).toBe('refused');
  });

  it('counts missing cache figures as 0', () => {
    const res = fromMessage(message({ usage: { input_tokens: 5, output_tokens: 1 } as Anthropic.Usage }));
    expect(res.usage?.prompt_tokens_details).toEqual({ cached_tokens: 0, cache_write_tokens: 0 });
  });
});

describe('anthropicClient', () => {
  it('sends the Messages API body and answers in the OpenRouter shape', async () => {
    const { sdk, created } = fakeSdk();
    const res = await anthropicClient(sdk).complete(request);
    expect(created).toEqual([toMessages(request)]);
    expect(res.choices[0]!.message.content).toBe('{"sells":"leads"}');
  });

  it('fails as unavailable when Anthropic refuses the key', async () => {
    const { sdk } = fakeSdk({
      create: () => {
        throw authError();
      },
    });
    const err = await anthropicClient(sdk).complete(request).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AiError);
    expect((err as AiError).code).toBe('unavailable');
  });

  it('passes other errors through', async () => {
    const boom = new Anthropic.InternalServerError(500, undefined, 'overloaded', headers);
    const { sdk } = fakeSdk({
      create: () => {
        throw boom;
      },
    });
    await expect(anthropicClient(sdk).complete(request)).rejects.toBe(boom);
  });
});

describe('checkKey', () => {
  it('reads each model once and passes when both exist', async () => {
    const { sdk, retrieved } = fakeSdk();
    expect(await checkKey(sdk, ['claude-haiku-5-5', 'claude-haiku-5-5'])).toEqual({ ok: true });
    expect(retrieved).toEqual(['claude-haiku-5-5']);
  });

  it('rejects a key Anthropic refuses', async () => {
    const { sdk } = fakeSdk({
      retrieve: () => {
        throw authError();
      },
    });
    expect(await checkKey(sdk, ['claude-haiku-5-5'])).toEqual({ ok: false, code: 'ai_key_rejected' });
  });

  it('names the model the key does not offer', async () => {
    const { sdk } = fakeSdk({
      retrieve: (id) => {
        if (id === 'claude-nope-1') throw notFound();
        return { id };
      },
    });
    expect(await checkKey(sdk, ['claude-haiku-5-5', 'claude-nope-1'])).toEqual({ ok: false, code: 'ai_model_unknown', model: 'claude-nope-1' });
  });
});
