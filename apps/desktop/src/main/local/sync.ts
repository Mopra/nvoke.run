import { CompaniesPage, SearchListResponse, type Company } from '@nvoke/shared';
import type { z } from 'zod';
import type { LocalChange, LocalStatus } from '../../ipc/contract';
import type { ApiClient } from '../api-bridge';
import { isActiveSearch, type LocalStore } from './store';

/** The searches list is read this often, and companies fetched when a search changed. */
export const SYNC_IDLE_MS = 60_000;
/** While a search runs, so its results land locally soon after it finishes. */
export const SYNC_ACTIVE_MS = 10_000;
/** Every synced search is fetched again this often, so opt-outs and retention reach the copy. */
export const SYNC_STALE_MS = 6 * 60 * 60_000;
/** Searches whose companies are fetched in one pass. The rest follow on the next. */
export const SYNC_SEARCHES_PER_PASS = 8;
const PAGE = 200;
const MAX_PAGES = 500;

const EMPTY_STATUS: LocalStatus = { online: null, syncing: false, syncedAt: null, searches: 0, companies: 0, emails: 0 };

type Fetched<T> = { kind: 'ok'; data: T } | { kind: 'gone' } | { kind: 'offline' } | { kind: 'error' };

export interface LeadSyncDeps {
  client: ApiClient;
  store: LocalStore;
  onChange(change: LocalChange): void;
  now?: () => number;
}

/**
 * Keeps the LocalStore in step with the API in the background while signed
 * in. Each pass reads `GET /v1/searches` (the list the store mirrors, so a
 * search the API stops returning is deleted locally) and fetches every page
 * of companies for searches that finished or changed, that the renderer asked
 * for, or that were last fetched over SYNC_STALE_MS ago. A fetch replaces the
 * search's companies, so an address the server dropped disappears here too.
 *
 * `stop()` cancels a pass in flight: every write checks the generation first,
 * so nothing lands after a sign out wiped the store.
 */
export class LeadSync {
  private enabled = false;
  private generation = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running: Promise<void> | null = null;
  private syncing = false;
  private again = false;
  private online: boolean | null = null;
  private syncedAt: number | null = null;
  private readonly wanted = new Set<string>();
  private readonly now: () => number;

  constructor(private readonly deps: LeadSyncDeps) {
    this.now = deps.now ?? Date.now;
  }

  get active(): boolean {
    return this.enabled;
  }

  status(): LocalStatus {
    if (!this.enabled) return EMPTY_STATUS;
    return {
      online: this.online,
      syncing: this.syncing,
      syncedAt: this.syncedAt === null ? null : new Date(this.syncedAt).toISOString(),
      ...this.deps.store.counts(),
    };
  }

  /** Starts syncing now and on a timer. A no-op when already started. */
  start(): void {
    if (this.enabled) return;
    this.enabled = true;
    this.generation++;
    void this.syncNow();
  }

  /** Stops syncing and deletes the local copy. */
  wipe(): void {
    this.enabled = false;
    this.generation++;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.running = null;
    this.syncing = false;
    this.again = false;
    this.online = null;
    this.syncedAt = null;
    this.wanted.clear();
    this.deps.store.wipe();
    this.emit([], true);
  }

  /** Fetches one search's companies again soon, for example when it is opened. */
  refresh(searchId: string): Promise<void> {
    if (!this.enabled) return Promise.resolve();
    this.wanted.add(searchId);
    return this.syncNow();
  }

  /** The user deleted a search through the API: drop the local copy at once. */
  deleted(searchId: string): void {
    if (this.enabled && this.deps.store.deleteSearch(searchId)) this.emit([searchId], true);
  }

  /** Runs a pass now, or right after the one in flight. Resolves when done. */
  syncNow(): Promise<void> {
    if (!this.enabled) return Promise.resolve();
    if (this.running) {
      this.again = true;
      return this.running;
    }
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const generation = this.generation;
    const run = (async () => {
      try {
        this.syncing = true;
        this.emit([], false);
        let hasActive = await this.pass(generation);
        while (this.again && generation === this.generation) {
          this.again = false;
          hasActive = await this.pass(generation);
        }
        if (generation === this.generation) this.schedule(hasActive ? SYNC_ACTIVE_MS : SYNC_IDLE_MS);
      } catch (err) {
        console.error('[local] sync failed', err);
        if (generation === this.generation) this.schedule(SYNC_IDLE_MS);
      } finally {
        if (generation === this.generation) {
          this.running = null;
          this.syncing = false;
          this.emit([], false);
        }
      }
    })();
    this.running = run;
    return run;
  }

  private schedule(ms: number): void {
    if (!this.enabled) return;
    this.timer = setTimeout(() => void this.syncNow(), ms);
    this.timer.unref?.();
  }

  /** One sync pass. Returns whether a search is still running. */
  private async pass(generation: number): Promise<boolean> {
    const list = await this.fetchJson('/v1/searches', SearchListResponse);
    if (generation !== this.generation) return false;
    if (list.kind !== 'ok') {
      if (list.kind === 'offline') {
        this.online = false;
        this.emit([], false);
      }
      return false;
    }
    this.online = true;
    this.syncedAt = this.now();

    const { store } = this.deps;
    const { changed, removed } = store.replaceSearches(list.data.searches);
    const touched = new Set(removed);
    const now = this.now();
    const stored = store.listStored();
    const hasActive = stored.some((s) => isActiveSearch(s.search));

    for (const s of stored) if (isActiveSearch(s.search)) this.wanted.delete(s.search.id);
    // Asked for first, then changed, then the longest unsynced.
    const rank = (s: (typeof stored)[number]): number =>
      (this.wanted.has(s.search.id) ? 0 : 2e15) + (s.syncedFingerprint === s.fingerprint ? 1e15 : 0) + (s.syncedAt ?? 0);
    const due = stored
      .filter(
        (s) =>
          !isActiveSearch(s.search) &&
          (this.wanted.has(s.search.id) ||
            s.syncedFingerprint !== s.fingerprint ||
            s.syncedAt === null ||
            now - s.syncedAt >= SYNC_STALE_MS),
      )
      .sort((a, b) => rank(a) - rank(b))
      .slice(0, SYNC_SEARCHES_PER_PASS);

    for (const s of due) {
      const id = s.search.id;
      const result = await this.fetchCompanies(id);
      if (generation !== this.generation) return false;
      if (result.kind === 'offline') {
        this.online = false;
        break;
      }
      this.wanted.delete(id);
      if (result.kind === 'gone') {
        if (store.deleteSearch(id)) touched.add(id);
      } else if (result.kind === 'ok') {
        if (store.replaceCompanies(id, result.data, s.fingerprint, this.now())) touched.add(id);
      }
    }

    if (changed || touched.size > 0) this.emit([...touched], changed || removed.length > 0);
    return hasActive;
  }

  private async fetchCompanies(searchId: string): Promise<Fetched<Company[]>> {
    const companies: Company[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < MAX_PAGES; page++) {
      const query = new URLSearchParams({ limit: String(PAGE) });
      if (cursor) query.set('cursor', cursor);
      const res = await this.fetchJson(`/v1/searches/${searchId}/companies?${query}`, CompaniesPage);
      if (res.kind !== 'ok') return res;
      companies.push(...res.data.companies);
      cursor = res.data.nextCursor;
      if (!cursor) return { kind: 'ok', data: companies };
    }
    return { kind: 'error' };
  }

  private async fetchJson<S extends z.ZodType>(path: string, schema: S): Promise<Fetched<z.infer<S>>> {
    let res: Response;
    try {
      res = await this.deps.client.api(path, { headers: { Accept: 'application/json' } });
    } catch {
      return { kind: 'offline' };
    }
    if (res.status === 404) return { kind: 'gone' };
    if (!res.ok) return { kind: 'error' };
    try {
      const parsed = schema.safeParse(await res.json());
      return parsed.success ? { kind: 'ok', data: parsed.data } : { kind: 'error' };
    } catch {
      return { kind: 'error' };
    }
  }

  private emit(searchIds: string[], searchesChanged: boolean): void {
    this.deps.onChange({ status: this.status(), searchIds, searchesChanged });
  }
}
