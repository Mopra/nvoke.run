import { SEARCH_KEY_PROVIDERS, type SaveSearchKeyRequest, type SearchKey, type SearchKeyProvider } from '@nvoke/shared';
import { ApiError } from './api';

/**
 * The Account screen's "Your own search key" setting as data: the status
 * line, the save body and the errors in plain words. The key itself is
 * never kept here.
 */

/** A provider's name, as the picker shows it. */
export function providerLabel(provider: SearchKeyProvider): string {
  return SEARCH_KEY_PROVIDERS.find((p) => p.id === provider)?.label ?? provider;
}

/** The status line: which key the account's web searches run on. */
export function searchKeyStatus(key: SearchKey | null): string {
  return key ? `${providerLabel(key.provider)} key ending in ${key.last4}` : 'Searching on nvoke’s key';
}

/** The body for `POST /v1/search-key`. Saving always sends a key, since it replaces the stored one. */
export function saveSearchKeyBody(form: { provider: SearchKeyProvider; apiKey: string }): SaveSearchKeyRequest {
  return { provider: form.provider, apiKey: form.apiKey.trim() };
}

/** What went wrong with a save, in plain words. */
export function searchKeyErrorMessage(error: unknown, provider: SearchKeyProvider): string {
  const name = providerLabel(provider);
  if (error instanceof ApiError) {
    if (error.code === 'search_key_rejected') {
      return error.detail ? `${name} refused that key: ${error.detail}` : `${name} refused that key. Check it and its credit.`;
    }
    if (error.code === 'source_unavailable') return `We couldn’t check the key with ${name} right now. Try again in a minute.`;
    if (error.code === 'invalid_request') return `That doesn’t look like a ${name} key. Paste the whole key.`;
    return error.message;
  }
  return error instanceof Error ? error.message : 'Something went wrong. Try again.';
}
