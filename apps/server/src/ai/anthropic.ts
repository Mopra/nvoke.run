// Claude straight from Anthropic, for accounts that bring their own key
// (keys.ts). It speaks the same ChatClient as the OpenRouter client, so
// createAi treats both alike: the request is turned into a Messages API call
// with structured output (`output_config.format`) and the answer back into
// the OpenRouter shape.

import Anthropic from '@anthropic-ai/sdk';
import { AiError, type ChatClient, type ChatRequest, type ChatResponse } from './client.js';

/** The parts of the Anthropic SDK the client uses, so tests can pass a fake. */
export interface AnthropicSdk {
  messages: { create(body: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message> };
  models: { retrieve(id: string): Promise<unknown> };
}

export function anthropicSdk(apiKey: string): AnthropicSdk {
  return new Anthropic({ apiKey, timeout: 120_000 });
}

const FINISH: Partial<Record<NonNullable<Anthropic.StopReason>, string>> = {
  end_turn: 'stop',
  stop_sequence: 'stop',
  max_tokens: 'length',
  model_context_window_exceeded: 'length',
  refusal: 'content_filter',
};

/** The Messages API body for a chat request. */
export function toMessages(body: ChatRequest): Anthropic.MessageCreateParamsNonStreaming {
  const system = body.messages.find((m) => m.role === 'system');
  const user = body.messages.find((m) => m.role === 'user');
  return {
    model: body.model,
    max_tokens: body.max_tokens,
    ...(typeof system?.content === 'string' ? { system: system.content } : {}),
    messages: [{ role: 'user', content: user?.content ?? '' }],
    output_config: {
      format: { type: 'json_schema', schema: body.response_format.json_schema.schema },
      ...(body.reasoning ? { effort: body.reasoning.effort } : {}),
    },
  };
}

/** A Messages API answer in the shape createAi reads. */
export function fromMessage(message: Anthropic.Message): ChatResponse {
  const text = message.content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('');
  const refused = message.stop_reason === 'refusal';
  return {
    model: message.model,
    choices: [
      {
        finish_reason: (message.stop_reason && FINISH[message.stop_reason]) ?? message.stop_reason,
        message: {
          content: refused ? null : text,
          refusal: refused ? (message.stop_details?.explanation ?? message.stop_details?.category ?? 'refused') : null,
        },
      },
    ],
    usage: {
      // Anthropic counts uncached input apart from cache reads and writes,
      // which is how costUsd prices them.
      prompt_tokens: message.usage.input_tokens,
      completion_tokens: message.usage.output_tokens,
      prompt_tokens_details: {
        cached_tokens: message.usage.cache_read_input_tokens ?? 0,
        cache_write_tokens: message.usage.cache_creation_input_tokens ?? 0,
      },
    },
  };
}

/** A ChatClient on the account's own Anthropic key. A refused key fails as `unavailable`. */
export function anthropicClient(sdk: AnthropicSdk): ChatClient {
  return {
    async complete(body) {
      try {
        return fromMessage(await sdk.messages.create(toMessages(body)));
      } catch (err) {
        if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
          throw new AiError('unavailable', `Anthropic refused the account's own API key (${err.status})`);
        }
        throw err;
      }
    },
  };
}

export type KeyCheck = { ok: true } | { ok: false; code: 'ai_key_rejected' } | { ok: false; code: 'ai_model_unknown'; model: string };

/** Whether the key works and offers both models. Free: it reads the Models API, no tokens. */
export async function checkKey(sdk: AnthropicSdk, models: string[]): Promise<KeyCheck> {
  for (const model of new Set(models)) {
    try {
      await sdk.models.retrieve(model);
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
        return { ok: false, code: 'ai_key_rejected' };
      }
      if (err instanceof Anthropic.NotFoundError) return { ok: false, code: 'ai_model_unknown', model };
      throw err;
    }
  }
  return { ok: true };
}
