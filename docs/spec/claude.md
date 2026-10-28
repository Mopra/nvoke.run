# Claude

Features that need judgment on text (the site profile, openers) call Claude through OpenRouter (`OPENROUTER_API_KEY`) and `apps/server/src/ai`, never the HTTP API directly.

- **Models.** `MODELS` in `src/ai/models.ts`: `bulk` is `anthropic/claude-haiku-5.5` for many small calls, `quality` is `anthropic/claude-sonnet-5.5` where the answer matters (the plan of a Describe your customer search). The cost is what OpenRouter reports per call, with prices next to the models as the fallback.
- **Structured output.** `createAi(...).structured({ userId, task, tier, system, prompt, schema, toolName, toolDescription })` asks for a JSON answer (structured outputs) whose schema comes from the zod schema, trimmed to shape, types and enums, and validates the answer with the full zod schema. Errors are `AiError` with a code: `unavailable` (no `OPENROUTER_API_KEY`), `budget_exceeded`, `refusal`, `no_output`, `invalid_output`.
- **Cost.** Every call is a row in `ai_usage` (user, task, model, tokens, `cost_usd`, no prompt or response text) and a log line with the user id. Before a call, the account's spend this calendar month (UTC) is checked against its budget: `AI_MONTHLY_BUDGET_PRICE_SHARE` (default 0.25) of the plan's price, never below `AI_MONTHLY_BUDGET_FLOOR_USD` (default 1). The check is not locked, so calls running at once may overshoot by their own cost.

## Your own Claude key

An account can run every Claude call on its own Anthropic API key instead of ours. Code in `src/ai/keys.ts` (store), `src/ai/anthropic.ts` (client) and `src/api/routes/ai-key.ts`, schemas in `packages/shared/src/ai-key.ts`.

- **Routes.** `GET /v1/ai-key` shows the stored key by its last 4 characters with both models (404 while the account runs on ours). `POST` with `apiKey`, `bulkModel` and `qualityModel` stores it; without `apiKey` it changes only the models of the stored key (404 when there is none). `DELETE` removes it (204, then 404). The key never comes back in a response or a log line.
- **Sealed.** The key is sealed with `SECRETS_KEY` (AES-256-GCM, `src/crypto/secrets.ts`) in `ai_keys`, one per account, and only `createAi` opens it. Without `SECRETS_KEY` no key can be stored (503 `ai_unavailable`) and none is used.
- **Models per tier.** The account picks the Anthropic model for each tier: `bulkModel` (default `claude-haiku-5-5`) for the many small calls, `qualityModel` (default `claude-sonnet-5-5`) for the few that matter. Any `claude-...` id is accepted; the screens offer `ANTHROPIC_MODELS`.
- **Checked first.** Before a key or a model change is kept, the key reads both models from Anthropic's Models API, which costs no tokens. A refused key is 400 `ai_key_rejected`, a model the key does not offer is 400 `ai_model_unknown` with the model in `detail`, and nothing is stored.
- **No fallback.** With a key stored, every call goes straight to Anthropic's Messages API on that key (structured output through `output_config.format`) and never to OpenRouter. A key Anthropic later refuses fails the call as `AiError` `unavailable`; the call is not retried on ours.
- **Own budget.** Calls on the account's key are billed by Anthropic, so they skip the monthly budget check. They are still rows in `ai_usage`, priced from the table, with `own_key` true, and `spentThisMonth` leaves them out.

## Your own search key

An account can run its paid web searches on its own Serper or Brave Search key instead of ours. Code in `src/leads/search-keys.ts` (store), `src/leads/sources/own-search.ts` (client) and `src/api/routes/search-key.ts`, schemas in `packages/shared/src/search-key.ts`.

- **Routes.** `GET /v1/search-key` shows the stored key by its provider and last 4 characters (404 while the account runs on ours). `POST` with `provider` (`serper` or `brave`) and `apiKey` stores it, replacing any key before it. `DELETE` removes it (204, then 404). The key never comes back in a response or a log line.
- **Sealed.** The key is sealed with `SECRETS_KEY` (AES-256-GCM, `src/crypto/secrets.ts`) in `search_keys`, one per account, and only the search client opens it. Without `SECRETS_KEY` no key can be stored (503 `source_unavailable`).
- **Checked first.** Before a key is kept, it runs one search, billed to it. A refused key is 400 `search_key_rejected` with the provider's answer in `detail`; any other failure is 503 `source_unavailable`. Nothing is stored either way.
- **Every paid page.** `ownSearchClient` sits in front of the whole search client, so web, domains, local, place lookups and Sonar (`icp`) searches of the account all run their paid pages on its key. One client per key keeps the key's rate limit across the searches of the process.
- **Shared cache.** Pages go through the same result cache as ours: a cached page is served free with `cache_hit`, and a page fetched on the account's key is cached for everyone.
- **No fallback.** A search with a key never touches our providers: no fallback to our key or to Mwmbl. A key the provider refuses fails the search with a permanent error that names the provider and points to Account; it does not pause or alert ours. A stored key that cannot be opened (no `SECRETS_KEY`, or a different one) fails the search the same way.
- **Own cost.** Requests on the account's key are reported as `own_request`: they count toward the search's request budget (a Sonar run stops at the same number of pages), but not toward `source_requests`, our monthly provider budgets or the cost per email.
