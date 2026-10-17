'use client';

import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from 'react';
import { useInfiniteQuery, useMutation, useMutationState, useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import type { ApiKey, CompaniesPage, CreateSearchInput, DraftOpenersInput, Search, SiteProfile, UpdateSearchRequest, UpdateSiteProfileRequest } from '@nvoke/shared';
import { toast } from 'sonner';
import { ApiError, type CompaniesQuery, type WebApi } from './api';
import { companiesPollInterval, edgePages, edgePollInterval } from './openers';
import { listPollInterval, searchPollInterval } from './quota';

/**
 * React Query hooks over the web API, with the same keys and polling as the
 * desktop app's lib/queries.ts.
 */

const ApiContext = createContext<WebApi | null>(null);

export function ApiProvider({ api, children }: { api: WebApi; children: ReactNode }) {
  return <ApiContext.Provider value={api}>{children}</ApiContext.Provider>;
}

export function useApi(): WebApi {
  const api = useContext(ApiContext);
  if (!api) throw new Error('useApi needs an ApiProvider');
  return api;
}

export const keys = {
  searches: ['searches'] as const,
  search: (id: string) => ['searches', id] as const,
  companies: (id: string, filters: Omit<CompaniesQuery, 'cursor'>) => ['searches', id, 'companies', filters] as const,
  me: ['me'] as const,
  apiKeys: ['api-keys'] as const,
  siteProfile: ['site-profile'] as const,
  siteProfileBuild: ['site-profile', 'build'] as const,
};

export function useSearches() {
  const api = useApi();
  return useQuery({
    queryKey: keys.searches,
    queryFn: api.listSearches,
    refetchInterval: (query) => listPollInterval(query.state.data),
  });
}

export function useSearch(id: string) {
  const api = useApi();
  const client = useQueryClient();
  return useQuery({
    queryKey: keys.search(id),
    queryFn: () => api.getSearch(id),
    initialData: () => client.getQueryData<Search[]>(keys.searches)?.find((s) => s.id === id),
    initialDataUpdatedAt: () => client.getQueryState(keys.searches)?.dataUpdatedAt,
    refetchInterval: (query) => searchPollInterval(query.state.data),
    retry: (count, error) => !(error instanceof ApiError && (error.status === 404 || error.status === 400)) && count < 2,
  });
}

/**
 * A search's companies, page by page. While the search runs (or slowly while
 * it keeps filling) only the first and the last loaded page are polled, so a
 * long scrolled list costs two requests a tick, not one per page. Every page
 * is refetched only while an opener is queued, since openers land anywhere.
 */
export function useCompanies(id: string, filters: Omit<CompaniesQuery, 'cursor'>, live: boolean, ongoing = false) {
  const api = useApi();
  const client = useQueryClient();
  const queryKey = keys.companies(id, filters);
  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => api.listCompanies(id, { ...filters, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    refetchInterval: (q) => companiesPollInterval(q.state.data?.pages),
    placeholderData: (previous) => previous,
  });

  const interval = edgePollInterval(live, ongoing);
  const keyText = JSON.stringify(queryKey);
  useEffect(() => {
    if (!interval) return;
    const key = JSON.parse(keyText) as typeof queryKey;
    const [, , , pollFilters] = key;
    let stopped = false;
    const tick = async (): Promise<void> => {
      const data = client.getQueryData<InfiniteData<CompaniesPage, string | undefined>>(key);
      // A full fetch is running, or openers are queued and every page is refetched anyway.
      if (!data || client.isFetching({ queryKey: key }) || companiesPollInterval(data.pages)) return;
      const indexes = edgePages(data.pages.length);
      try {
        const fresh = await Promise.all(indexes.map((i) => api.listCompanies(id, { ...pollFilters, cursor: data.pageParams[i] })));
        if (stopped) return;
        client.setQueryData<InfiniteData<CompaniesPage, string | undefined>>(key, (current) => {
          // A page was loaded or the list refetched meanwhile: that answer is newer.
          if (!current || current.pages.length !== data.pages.length) return current;
          const pages = [...current.pages];
          indexes.forEach((index, n) => {
            pages[index] = fresh[n]!;
          });
          return { ...current, pages };
        });
      } catch {
        // The next tick tries again; a dead connection shows on the search itself.
      }
    };
    const timer = setInterval(() => void tick(), interval);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [interval, keyText, id, api, client]);

  return query;
}

/**
 * Polling stops when a search finishes, so the last poll can miss the final
 * crawls and the usage meter is still the old one. When `live` turns false,
 * refetch the search's companies (all searches when `id` is null) and the account.
 */
export function useRefreshWhenFinished(live: boolean, id: string | null): void {
  const client = useQueryClient();
  const wasLive = useRef(live);
  useEffect(() => {
    if (wasLive.current && !live) {
      void client.invalidateQueries({ queryKey: id ? [...keys.search(id), 'companies'] : keys.searches });
      void client.invalidateQueries({ queryKey: keys.me });
    }
    wasLive.current = live;
  }, [live, id, client]);
}

/** Queues openers for a search (or some of its companies), then refetches its companies so the queued ones show and poll. */
export function useDraftOpeners(id: string) {
  const api = useApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: DraftOpenersInput) => api.draftOpeners(id, body),
    onSuccess: () => void client.invalidateQueries({ queryKey: [...keys.search(id), 'companies'] }),
  });
}

export function useMe() {
  const api = useApi();
  return useQuery({ queryKey: keys.me, queryFn: () => api.getMe(), staleTime: 30_000 });
}

/**
 * Re-reads the plan from Clerk Billing on mount and when the tab regains
 * focus, so a checkout finished in another tab shows up on return.
 */
export function usePlanSync(): void {
  const api = useApi();
  const client = useQueryClient();
  useEffect(() => {
    const sync = (): void => {
      api.getMe(true).then(
        (me) => client.setQueryData(keys.me, me),
        () => undefined,
      );
    };
    sync();
    window.addEventListener('focus', sync);
    return () => window.removeEventListener('focus', sync);
  }, [api, client]);
}

export function useCreateSearch() {
  const api = useApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSearchInput) => api.createSearch(input),
    onSuccess: (search) => {
      client.setQueryData(keys.search(search.id), search);
      client.setQueryData<Search[]>(keys.searches, (list) => (list ? [search, ...list] : [search]));
      void client.invalidateQueries({ queryKey: keys.searches, exact: true });
    },
    onError: (error) => {
      // The server knows the allowance is spent: show it everywhere at once.
      if (error instanceof ApiError && error.code === 'quota_exceeded') void client.invalidateQueries({ queryKey: keys.me });
    },
  });
}

/**
 * Runs an ended search again into the same list. The search goes back to
 * queued, so its page polls again; its companies refetch at once.
 */
export function useSearchMore(id: string) {
  const api = useApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSearchInput) => api.searchMore(id, input),
    onSuccess: (search) => {
      client.setQueryData(keys.search(search.id), search);
      client.setQueryData<Search[]>(keys.searches, (list) => list?.map((s) => (s.id === search.id ? search : s)));
      void client.invalidateQueries({ queryKey: [...keys.search(id), 'companies'] });
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === 'quota_exceeded') void client.invalidateQueries({ queryKey: keys.me });
      // Someone else started it meanwhile (another tab, the desktop app): show it running.
      if (error instanceof ApiError && error.code === 'search_running') void client.invalidateQueries({ queryKey: keys.search(id), exact: true });
    },
  });
}

/** Switches a search's ongoing on or off, and shows the answer in both caches. */
export function useUpdateSearch() {
  const api = useApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateSearchRequest }) => api.updateSearch(id, patch),
    onSuccess: (search) => {
      client.setQueryData(keys.search(search.id), search);
      client.setQueryData<Search[]>(keys.searches, (list) => list?.map((s) => (s.id === search.id ? search : s)));
    },
    // Here, not per call: the New search screen is gone by the time the answer comes, and its callbacks with it.
    onError: (error, { patch }) => {
      toast.error(patch.ongoing ? 'Couldn’t switch on Keep finding new leads' : 'Couldn’t stop looking for new leads', {
        description: patch.ongoing ? `${error.message} The search runs once. Switch it on from its page.` : error.message,
      });
    },
  });
}

export function useCancelSearch() {
  const api = useApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.cancelSearch(id),
    onSuccess: (search) => {
      client.setQueryData(keys.search(search.id), search);
      client.setQueryData<Search[]>(keys.searches, (list) => list?.map((s) => (s.id === search.id ? search : s)));
    },
  });
}

export function useDeleteSearch() {
  const api = useApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteSearch(id),
    onSuccess: (_void, id) => {
      client.setQueryData<Search[]>(keys.searches, (list) => list?.filter((s) => s.id !== id));
      client.removeQueries({ queryKey: keys.search(id) });
      void client.invalidateQueries({ queryKey: keys.me });
    },
  });
}

export function useApiKeys() {
  const api = useApi();
  return useQuery({ queryKey: keys.apiKeys, queryFn: api.listApiKeys });
}

export function useCreateApiKey() {
  const api = useApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api.createApiKey(name),
    onSuccess: (created) => {
      // Never keep the secret in the cache: only the listed shape.
      const { key: _secret, ...listed } = created;
      client.setQueryData<ApiKey[]>(keys.apiKeys, (list) => (list ? [listed, ...list] : [listed]));
    },
  });
}

export function useRevokeApiKey() {
  const api = useApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.revokeApiKey(id),
    onSuccess: (_void, id) => {
      client.setQueryData<ApiKey[]>(keys.apiKeys, (list) => list?.filter((k) => k.id !== id));
    },
  });
}

/** The account's site profile: null before the first build. Changes only when the user acts, so no polling. */
export function useSiteProfile() {
  const api = useApi();
  return useQuery({ queryKey: keys.siteProfile, queryFn: api.getSiteProfile, staleTime: 5 * 60_000 });
}

/** One build of the site profile, as the screens start it. */
export interface ProfileBuild {
  /** What the server gets, from readWebsite. */
  website: string;
  /** What the screen shows. */
  domain: string;
  /** What the user typed, back in the field if the build fails. */
  typed: string;
  /** Where Cancel goes back to: the field, or the profile on file (Read again). */
  from: 'form' | 'profile';
  /** Aborting it hangs up, and the server stops reading. */
  controller: AbortController;
}

/**
 * Reads the website and plans searches (10 to 30 seconds), replacing the
 * stored profile. The fixed key lets New search find a build again after the
 * user left it (useLatestProfileBuild); the result lands in the cache either way.
 */
export function useBuildSiteProfile() {
  const api = useApi();
  const client = useQueryClient();
  return useMutation({
    mutationKey: keys.siteProfileBuild,
    // Offline it fails at once with the network line, rather than waiting paused where Cancel cannot reach it.
    networkMode: 'always',
    // Kept for an hour once the screen is left, so its outcome is still there on the way back.
    gcTime: 60 * 60_000,
    mutationFn: (build: ProfileBuild) => api.buildSiteProfile(build.website, build.controller.signal),
    onSuccess: (profile) => client.setQueryData<SiteProfile | null>(keys.siteProfile, profile),
  });
}

export interface LatestProfileBuild {
  id: number;
  status: 'idle' | 'pending' | 'success' | 'error';
  build: ProfileBuild;
  error: unknown;
  /** When it was sent, so the phases pick up where they were. */
  startedAt: number;
}

/** The last build started this session, from any screen, running or not. */
export function useLatestProfileBuild(): LatestProfileBuild | undefined {
  return useMutationState({
    filters: { mutationKey: keys.siteProfileBuild },
    select: (m): LatestProfileBuild => ({
      id: m.mutationId,
      status: m.state.status,
      build: m.state.variables as ProfileBuild,
      error: m.state.error,
      startedAt: m.state.submittedAt,
    }),
  }).at(-1);
}

/** Drops the finished builds once the screen has taken their outcome, so coming back does not show it again. */
export function useForgetProfileBuilds(): () => void {
  const client = useQueryClient();
  return useCallback(() => {
    const cache = client.getMutationCache();
    for (const m of cache.findAll({ mutationKey: keys.siteProfileBuild })) {
      if (m.state.status !== 'pending') cache.remove(m);
    }
  }, [client]);
}

export function useUpdateSiteProfile() {
  const api = useApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (patch: UpdateSiteProfileRequest) => api.updateSiteProfile(patch),
    onSuccess: (profile) => client.setQueryData<SiteProfile | null>(keys.siteProfile, profile),
    onError: (error) => {
      // Gone on the server (built over from another tab, or deleted): show the website step.
      if (error instanceof ApiError && error.status === 404) client.setQueryData<SiteProfile | null>(keys.siteProfile, null);
    },
  });
}
