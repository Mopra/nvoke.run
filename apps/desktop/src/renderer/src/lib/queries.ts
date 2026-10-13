import { useEffect, useRef } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from './api';
import { isActive } from './format';
import type { ApiKey } from '@nvoke/shared';
import type { CompaniesQuery, Search, SearchInput } from './types';

/** Running searches are polled at this interval, as the spec asks. */
export const POLL_MS = 2000;

export const keys = {
  searches: ['searches'] as const,
  search: (id: string) => ['searches', id] as const,
  companies: (id: string, filters: Omit<CompaniesQuery, 'cursor'>) => ['searches', id, 'companies', filters] as const,
  me: ['me'] as const,
  apiKeys: ['api-keys'] as const,
};

export function useSearches() {
  return useQuery({
    queryKey: keys.searches,
    queryFn: api.listSearches,
    refetchInterval: (query) => (query.state.data?.some((s) => isActive(s.status)) ? POLL_MS : false),
  });
}

export function useSearch(id: string) {
  const client = useQueryClient();
  return useQuery({
    queryKey: keys.search(id),
    queryFn: () => api.getSearch(id),
    initialData: () => client.getQueryData<Search[]>(keys.searches)?.find((s) => s.id === id),
    initialDataUpdatedAt: () => client.getQueryState(keys.searches)?.dataUpdatedAt,
    refetchInterval: (query) => (query.state.data && isActive(query.state.data.status) ? POLL_MS : false),
    retry: (count, error) => !(error instanceof ApiError && error.status === 404) && count < 2,
  });
}

export function useCompanies(id: string, filters: Omit<CompaniesQuery, 'cursor'>, live: boolean) {
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
 * refetch the given search's companies (all searches' when `id` is null) and
 * the account.
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
  return useQuery({ queryKey: keys.me, queryFn: () => api.getMe(), staleTime: 30_000 });
}

/**
 * Re-reads the plan from Clerk Billing when mounted and whenever the window
 * regains focus, so a checkout finished in the browser shows up on return.
 */
export function usePlanSync(): void {
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
  }, [client]);
}

export function useCreateSearch() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: SearchInput) => api.createSearch(input),
    onSuccess: (search) => {
      client.setQueryData(keys.search(search.id), search);
      client.setQueryData<Search[]>(keys.searches, (list) => (list ? [search, ...list] : [search]));
      void client.invalidateQueries({ queryKey: keys.searches, exact: true });
    },
  });
}

export function useCancelSearch() {
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
  return useQuery({ queryKey: keys.apiKeys, queryFn: api.listApiKeys });
}

export function useCreateApiKey() {
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
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.revokeApiKey(id),
    onSuccess: (_void, id) => {
      client.setQueryData<ApiKey[]>(keys.apiKeys, (list) => list?.filter((k) => k.id !== id));
    },
  });
}
