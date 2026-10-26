# Your own Claude key

**What.** A setting on Account, under the plan: the account's Claude calls run on the user's own Anthropic key instead of nvoke's, with a model per tier. The server side is in docs/SPEC.md, "Your own Claude key".

**Readout.** "Running on nvoke's Claude." while the account has no key (`GET /v1/ai-key` answers 404, read as none). With a key: "Anthropic key ending in WXYZ" and the bulk and quality models by name, plus a Remove key button.

**Form.** A password field for the key (`sk-ant-...`), labeled Replace key once one is stored. Two selects from `ANTHROPIC_MODELS`: Bulk model (fit scoring, people, openers) and Quality model (search plans, site profile), on the stored models or `DEFAULT_AI_MODELS`. A model set through the API that the list does not offer still shows as its id. Save key sends `POST /v1/ai-key` with the key and both models; with the key field empty and a key stored, the button reads Save models and leaves out `apiKey`. The key field clears after a save. One line under the form: calls on your key are billed by Anthropic, models other than the defaults are untested.

**Errors.** One plain line under the selects: `ai_key_rejected` ("Anthropic turned that key down"), `ai_model_unknown` naming the model from `detail`, and the usual network and server lines. Main passes a `detail` through the bridge when it is a short lowercase code or a model id (`/^[a-z][a-z0-9_.-]{0,79}$/`).

**Remove.** Remove key asks first, then sends `DELETE /v1/ai-key`; Claude calls run on nvoke's key again.

**Code.** `screens/account/ClaudeKey.tsx`; `getAiKey`, `saveAiKey`, `deleteAiKey` in `lib/api.ts`; `useAiKey`, `useSaveAiKey`, `useDeleteAiKey` in `lib/queries.ts` (key `['ai-key']`). No new IPC channel: it goes through `window.nvoke.request`. The mock (`VITE_MOCK=1`) answers all three routes, keeps the key in `localStorage` (`nvoke.mock.ai-key`), rejects a key not starting with `sk-ant-` and a model not in `ANTHROPIC_MODELS`. The Account capture shot (`12-account`) shows it.
