# Your own search key

**What.** A setting on Account, right under Your own Claude key: the account's paid web searches run on the user's own Serper or Brave Search key instead of nvoke's. The server side is in docs/SPEC.md, "Your own search key".

**Readout.** "Searching on nvoke's key." while the account has no key (`GET /v1/search-key` answers 404, read as none). With a key: "Serper key ending in WXYZ" (or Brave Search), plus a Remove key button.

**Form.** A segmented Search engine choice from `SEARCH_KEY_PROVIDERS`, Serper first and picked by default (or the stored provider), with the provider's hint under it and "Recommended." in front of Serper's. A password field for the key, labeled Replace key once one is stored. Save key sends `POST /v1/search-key` with the provider and the key; the key is always required and replaces a stored one, so the button stays off while the field is empty. The server tries the key with one search, billed to it. The field clears after a save. One line under the form: searches on your key are billed by Serper or Brave, results are cached and shared, a refused key fails the search instead of using ours.

**Errors.** One plain line above the button. `search_key_rejected`: "Serper refused that key, or its plan has no credit left." The server's `detail` is what the engine answered and is often free text; main's bridge only passes a short lowercase code (`/^[a-z][a-z0-9_.-]{0,79}$/`), so the line adds "It said: ..." only when one survives and otherwise stands alone. The bridge is not loosened for it. `source_unavailable` (503): "Serper isn't answering right now. Try again in a minute." Network and server errors use the usual lines.

**Remove.** Remove key asks first, then sends `DELETE /v1/search-key`; web searches run on nvoke's key again.

**Code.** `screens/account/SearchKey.tsx`; `getSearchKey`, `saveSearchKey`, `deleteSearchKey` in `lib/api.ts`; `useSearchKey`, `useSaveSearchKey`, `useDeleteSearchKey` in `lib/queries.ts` (key `['search-key']`). No new IPC channel: it goes through `window.nvoke.request`. The mock (`VITE_MOCK=1`) answers all three routes, starts with no key (GET 404), keeps a saved key in `localStorage` (`nvoke.mock.search-key`) and refuses a key containing `bad`. The Account capture shot (`12-account`) shows it.
