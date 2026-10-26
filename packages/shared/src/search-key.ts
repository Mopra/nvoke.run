import { z } from 'zod';

// Bring your own search key (docs/SPEC.md, "Your own search key"): an account
// can run its paid web searches on its own Serper or Brave key. The key is
// sealed on the server and never sent back.

export const SEARCH_KEY_PROVIDERS = [
  { id: 'serper', label: 'Serper', hint: 'Google results, about $1 per 1,000 queries. serper.dev' },
  { id: 'brave', label: 'Brave Search', hint: 'About $5 per 1,000 queries. brave.com/search/api' },
] as const;

export const SearchKeyProvider = z.enum(['serper', 'brave']);
export type SearchKeyProvider = z.infer<typeof SearchKeyProvider>;

export const SearchKey = z.object({
  provider: SearchKeyProvider,
  /** The last 4 characters of the key, to tell keys apart. */
  last4: z.string(),
  updatedAt: z.string(),
});
export type SearchKey = z.infer<typeof SearchKey>;

export const SaveSearchKeyRequest = z.object({
  provider: SearchKeyProvider,
  apiKey: z.string().trim().min(16).max(400),
});
export type SaveSearchKeyRequest = z.infer<typeof SaveSearchKeyRequest>;
