import type { CompaniesPage, Company, LeadFilters, Search } from '@nvoke/shared';

/** The local copy of searches, companies and checked emails in SQLite. */
export const LocalChannel = {
  localSearches: 'local:searches',
  localSearch: 'local:search',
  localCompanies: 'local:companies',
  localFind: 'local:find',
  localRefresh: 'local:refresh',
  localStatus: 'local:status',
  /** Main to renderer push, payload LocalChange. */
  localChanged: 'local:changed',
} as const;

/** How the local copy of the user's leads stands. All zero when signed out. */
export interface LocalStatus {
  /** Whether the last sync reached the server. Null before the first attempt. */
  online: boolean | null;
  syncing: boolean;
  /** ISO time of the last sync that reached the server. */
  syncedAt: string | null;
  searches: number;
  companies: number;
  emails: number;
}

/** Pushed after a sync or a delete changed the local copy. */
export interface LocalChange {
  status: LocalStatus;
  /** Searches whose companies were replaced or removed locally. */
  searchIds: string[];
  /** True when searches were added, changed or removed, so the list changed. */
  searchesChanged: boolean;
}

/** `LeadFilters` (`people` and `decisionMakers` too) with an offset page. `limit` is 1 to 500, 200 by default. */
export type LocalCompaniesQuery = LeadFilters & { offset?: number; limit?: number };

/** Same companies and total as `CompaniesPage`, with an offset instead of a cursor. */
export type LocalCompaniesPage = Omit<CompaniesPage, 'nextCursor'> & { nextOffset: number | null };

/** A text search over every lead in the local copy. `limit` is 1 to 50, 8 by default. */
export interface LocalFindQuery {
  q: string;
  limit?: number;
}

/** One company that matched, with the search it came from. */
export interface LocalLeadHit {
  search: Search;
  company: Company;
}

/** The newest matches first, and how many matched in all. */
export interface LocalFindResult {
  hits: LocalLeadHit[];
  total: number;
}

/**
 * The copy of searches, companies and checked emails the main process keeps
 * in SQLite in userData. It mirrors what the API returns: a search or address
 * the API stops returning is deleted here too, and sign out wipes it.
 */
export interface LocalApi {
  /** The synced searches, newest first. Null when there is no local copy. */
  searches(): Promise<Search[] | null>;
  search(id: string): Promise<Search | null>;
  /**
   * Filters a finished search's companies locally, with the semantics of
   * `GET /v1/searches/:id/companies`. Null when the search is not synced yet
   * or still running.
   */
  companies(searchId: string, query: LocalCompaniesQuery): Promise<LocalCompaniesPage | null>;
  /**
   * Finds companies across every synced search whose name, domain or an
   * address contains `q`, newest search first. Null when there is no local copy.
   */
  find(query: LocalFindQuery): Promise<LocalFindResult | null>;
  /** Re-fetches one search's companies in the background. */
  refresh(searchId: string): Promise<void>;
  status(): Promise<LocalStatus>;
  /** Subscribes to changes. Returns an unsubscribe function. */
  onChange(listener: (change: LocalChange) => void): () => void;
}

export interface LocalBridge {
  local: LocalApi;
}
