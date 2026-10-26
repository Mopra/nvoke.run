import { describe, expect, it } from 'vitest';
import { DEFAULT_AI_MODELS } from '@nvoke/shared';
import { ApiError, createWebApi } from './api';
import { aiKeyErrorMessage, modelLabel, saveAiKeyBody } from './ai-key';

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('saveAiKeyBody', () => {
  it('sends a trimmed key with both models', () => {
    expect(saveAiKeyBody({ apiKey: '  sk-ant-abc  ', ...DEFAULT_AI_MODELS })).toEqual({ apiKey: 'sk-ant-abc', ...DEFAULT_AI_MODELS });
  });

  it('leaves the key out when the field is empty, to change only the models', () => {
    expect(saveAiKeyBody({ apiKey: ' ', bulkModel: 'claude-sonnet-5-5', qualityModel: 'claude-opus-5-5' })).toEqual({
      bulkModel: 'claude-sonnet-5-5',
      qualityModel: 'claude-opus-5-5',
    });
  });
});

describe('aiKeyErrorMessage', () => {
  it('says the key was refused', () => {
    expect(aiKeyErrorMessage(new ApiError(400, 'ai_key_rejected'))).toMatch(/refused that key/);
  });

  it('names the model the key cannot use', () => {
    expect(aiKeyErrorMessage(new ApiError(400, 'ai_model_unknown', null, 'claude-opus-5-5'))).toMatch(/^Claude Opus 5\.5 isn’t available/);
    expect(aiKeyErrorMessage(new ApiError(400, 'ai_model_unknown', null, 'claude-x-1'))).toMatch(/^claude-x-1 isn’t/);
  });

  it('falls back to the general wording', () => {
    expect(aiKeyErrorMessage(new ApiError(0, 'network'))).toMatch(/Can’t reach nvoke/);
  });
});

describe('modelLabel', () => {
  it('names a listed model', () => {
    expect(modelLabel('claude-haiku-5-5')).toBe('Claude Haiku 5.5');
  });
});

describe('ai key api', () => {
  it('reads no key as null and keeps other errors', async () => {
    const answers = [json({ error: 'not_found' }, 404), json({ error: 'internal' }, 500)];
    const fetch = (async () => answers.shift() as Response) as unknown as typeof globalThis.fetch;
    const api = createWebApi({ baseUrl: 'https://api', getToken: async () => 't', fetch });
    await expect(api.getAiKey()).resolves.toBeNull();
    await expect(api.getAiKey()).rejects.toBeInstanceOf(ApiError);
  });

  it('posts the save and keeps the model in detail', async () => {
    const sent: RequestInit[] = [];
    const fetch = (async (_url: unknown, init: RequestInit) => {
      sent.push(init);
      return json({ error: 'ai_model_unknown', detail: 'claude-opus-5-5' }, 400);
    }) as unknown as typeof globalThis.fetch;
    const api = createWebApi({ baseUrl: 'https://api', getToken: async () => 't', fetch });
    const error = (await api.saveAiKey({ bulkModel: 'claude-haiku-5-5', qualityModel: 'claude-opus-5-5' }).catch((e: unknown) => e)) as ApiError;
    expect(sent[0]?.method).toBe('POST');
    expect(error.code).toBe('ai_model_unknown');
    expect(error.detail).toBe('claude-opus-5-5');
  });
});
