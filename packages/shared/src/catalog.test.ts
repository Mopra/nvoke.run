import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ENDPOINTS, ERROR_CODES, MCP_INSTRUCTIONS, MCP_TOOLS } from './catalog.ts';

// The catalog is split into one file per group under ./catalog/. These pins
// keep the order the OpenAPI document, /docs and the MCP tool list show.

/** Stable JSON of a catalog value, zod schemas written out as JSON Schema. */
function digest(value: unknown): string {
  const json = JSON.stringify(value, (_key, v: unknown) =>
    v instanceof z.ZodType
      ? {
          zod: z.toJSONSchema(v, { io: 'input', unrepresentable: 'any' }),
          out: z.toJSONSchema(v, { io: 'output', unrepresentable: 'any' }),
        }
      : v,
  );
  return createHash('sha256').update(json).digest('hex');
}

describe('catalog order', () => {
  it('keeps the endpoints in order', () => {
    expect(ENDPOINTS.map((e) => e.id)).toEqual([
      'getMe',
      'listPlans',
      'getSiteProfile',
      'buildSiteProfile',
      'updateSiteProfile',
      'deleteSiteProfile',
      'getAiKey',
      'saveAiKey',
      'deleteAiKey',
      'getSearchKey',
      'saveSearchKey',
      'deleteSearchKey',
      'createSearch',
      'listSearches',
      'getSearch',
      'searchMore',
      'updateSearch',
      'cancelSearch',
      'deleteSearch',
      'listCompanies',
      'getCompany',
      'updateCompany',
      'deleteCompany',
      'deleteEmail',
      'exportCsv',
      'draftOpeners',
      'claimLocalCrawl',
      'submitLocalCrawl',
      'listDrops',
      'getDrop',
      'createDrop',
      'updateDrop',
      'runDrop',
      'deleteDrop',
      'listWebhooks',
      'getWebhook',
      'createWebhook',
      'updateWebhook',
      'deleteWebhook',
      'testWebhook',
      'listWebhookDeliveries',
      'listApiKeys',
      'createApiKey',
      'getApiKey',
      'renameApiKey',
      'revokeApiKey',
      'agentSignup',
      'getClaim',
      'claimAccount',
      'optOut',
      'toolVerifyEmail',
      'toolExtractEmails',
      'toolEmailAuth',
      'openapi',
      'health',
    ]);
  });

  it('keeps the MCP tools in order', () => {
    expect(MCP_TOOLS.map((t) => t.name)).toEqual([
      'get_account',
      'start_search',
      'wait_for_search',
      'get_search',
      'list_searches',
      'get_leads',
      'get_company',
      'update_company',
      'delete_company',
      'delete_email',
      'export_csv',
      'draft_openers',
      'search_more',
      'set_search_ongoing',
      'set_check_inboxes',
      'cancel_search',
      'delete_search',
      'list_webhooks',
      'create_webhook',
      'update_webhook',
      'test_webhook',
      'delete_webhook',
      'list_drops',
      'create_drop',
      'update_drop',
      'run_drop',
      'delete_drop',
    ]);
  });

  it('keeps the error codes in order', () => {
    expect(Object.keys(ERROR_CODES)).toEqual([
      'unauthorized',
      'claim_required',
      'invalid_request',
      'not_found',
      'quota_exceeded',
      'source_unavailable',
      'not_cancelable',
      'search_running',
      'kind_mismatch',
      'ongoing_not_supported',
      'search_canceled',
      'not_claimed',
      'api_key_limit',
      'account_exists',
      'email_not_accepted',
      'rate_limited',
      'captcha_failed',
      'busy',
      'site_unreadable',
      'ai_unavailable',
      'ai_key_rejected',
      'ai_model_unknown',
      'search_key_rejected',
      'signup_unavailable',
      'too_many_drops',
      'too_many_webhooks',
      'webhook_url_not_allowed',
      'database_unavailable',
    ]);
  });

  it('keeps every entry exactly as it was', () => {
    expect({
      endpoints: digest(ENDPOINTS),
      tools: digest(MCP_TOOLS),
      errors: digest(ERROR_CODES),
      instructions: digest(MCP_INSTRUCTIONS),
    }).toEqual({
      endpoints: 'fc0dc4301b3755db56408dcd05299c29bc8b3eb6e521cd83ae0e259d88f05ff5',
      tools: '452326f3a000ccdffe00198b74b51590cdebc377d1e29f21917a6b3c13395dc6',
      errors: 'd2e7f553446f56a68c885e91a098851d840a56f4422200e96935d0b8be81ee8f',
      instructions: '69798b295ce67ebc9b5616d50fa45a791860bfe85d4566c8dfa04ee929c0a02c',
    });
  });
});
