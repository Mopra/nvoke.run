/**
 * Wire types for the nvoke API, mirroring docs/SPEC.md. They are written by
 * hand so the renderer can be built before packages/shared/src/leads.ts
 * lands. Once it does, replace this file with re-exports of the zod inferred
 * types from @nvoke/shared and fix whatever the compiler points at.
 *
 * Field names are camelCase on the wire (the server maps snake_case columns).
 */

export type SearchKind = 'local' | 'web' | 'launches';
export type SearchStatus = 'queued' | 'running' | 'done' | 'failed' | 'canceled';
export type CrawlStatus = 'pending' | 'done' | 'failed' | 'blocked';
export type EmailKind = 'generic' | 'personal';
export type Verification = 'valid' | 'invalid' | 'risky' | 'catch_all' | 'unknown';
export type Plan = 'free' | 'pro' | 'business';

/** `local`: niche plus location, resolved through OpenStreetMap. */
export interface LocalParams {
  niche: string;
  location: string;
}

/** `web`: a keyword, optionally narrowed to one country (ISO 3166 alpha 2). */
export interface WebParams {
  keyword: string;
  country?: string;
}

export type LaunchWindow = 'day' | 'week' | 'month';

/** `launches`: Product Hunt and Show HN within a time window. */
export interface LaunchesParams {
  keyword?: string;
  window: LaunchWindow;
}

export type SearchInput =
  | { kind: 'local'; params: LocalParams; limit?: number }
  | { kind: 'web'; params: WebParams; limit?: number }
  | { kind: 'launches'; params: LaunchesParams; limit?: number };

export interface SearchBase {
  id: string;
  limit: number;
  status: SearchStatus;
  /** Machine readable, for example `quota_exceeded`. */
  error: string | null;
  companiesFound: number;
  companiesCrawled: number;
  emailsFound: number;
  emailsValid: number;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export type Search =
  | (SearchBase & { kind: 'local'; params: LocalParams })
  | (SearchBase & { kind: 'web'; params: WebParams })
  | (SearchBase & { kind: 'launches'; params: LaunchesParams });

export interface Email {
  id: string;
  address: string;
  kind: EmailKind;
  sourceUrl: string | null;
  verification: Verification;
  checkedAt: string | null;
}

export interface Company {
  id: string;
  searchId: string;
  name: string;
  domain: string;
  website: string;
  source: string;
  sourceRef: string | null;
  location: string | null;
  phone: string | null;
  category: string | null;
  crawlStatus: CrawlStatus;
  crawledAt: string | null;
  emails: Email[];
}

export interface CompaniesQuery {
  cursor?: string;
  verification?: Verification;
  kind?: EmailKind;
  q?: string;
}

export interface CompaniesPage {
  items: Company[];
  nextCursor: string | null;
  /** Companies matching the filters across all pages. */
  total: number;
}

export interface User {
  id: string;
  email: string;
  name: string | null;
  imageUrl: string | null;
}

export interface Usage {
  /** yyyy-mm */
  period: string;
  emailsFound: number;
  limit: number;
}

export interface Me {
  user: User;
  plan: Plan;
  usage: Usage;
}

export type AuthState = { status: 'signed-in'; user: User } | { status: 'signed-out' };

export interface ExportResult {
  /** False when the user dismissed the save dialog. */
  saved: boolean;
  filePath?: string;
}
