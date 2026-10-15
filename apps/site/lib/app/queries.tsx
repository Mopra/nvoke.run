'use client';

import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApiKey, CreateSearchInput, Search } from '@nvoke/shared';
import { ApiError, type CompaniesQuery, type WebApi } from './api';
import { listPollInterval, POLL_MS, searchPollInterval } from './quota';

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

export function useCompanies(id: string, filters: Omit<CompaniesQuery, 'cursor'>, live: boolean) {
  const api = useApi();
  return useInfiniteQuery({
    queryKey: keys.companies(id, filters),
    queryFn: ({ pageParam }) => api.listCompanies(id, { ...filters, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    refetchInterval: live ? POLL_MS : false,
    placeholderData: (previous) => previous,
  });
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
