import { ANTHROPIC_MODELS, type SaveAiKeyRequest } from '@nvoke/shared';
import { ApiError } from './api';

/**
 * The Account screen's "Your own Claude key" setting as data: the save body
 * and the errors in plain words. The key itself is never kept here.
 */

export interface AiKeyForm {
  /** What is in the key field. Empty keeps the stored key and changes only the models. */
  apiKey: string;
  bulkModel: string;
  qualityModel: string;
}

/** The body for `POST /v1/ai-key`. An empty key field leaves `apiKey` out. */
export function saveAiKeyBody(form: AiKeyForm): SaveAiKeyRequest {
  const apiKey = form.apiKey.trim();
  return { ...(apiKey ? { apiKey } : {}), bulkModel: form.bulkModel, qualityModel: form.qualityModel };
}

/** A model's name from its id; an id nvoke does not list is shown as it is. */
export function modelLabel(id: string): string {
  return ANTHROPIC_MODELS.find((m) => m.id === id)?.label ?? id;
}

/** What went wrong with a save, in plain words. */
export function aiKeyErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'ai_key_rejected') return 'Anthropic refused that key. Check it in the Claude Console.';
    if (error.code === 'ai_model_unknown') {
      const model = error.detail ? modelLabel(error.detail) : 'One of the models';
      return `${model} isn’t available on that key. Pick another model.`;
    }
    if (error.code === 'invalid_request') return 'That doesn’t look like an Anthropic key. It starts with sk-ant-.';
    return error.message;
  }
  return error instanceof Error ? error.message : 'Something went wrong. Try again.';
}
