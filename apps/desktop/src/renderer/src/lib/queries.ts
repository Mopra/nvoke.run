import { useEffect, useRef } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from './api';
import { isActive } from './format';
import type { ApiKey, CreateWebhookRequest, UpdateWebhookRequest, Webhook } from '@nvoke/shared';
import type { CompaniesQuery, Drop, DropInput, DropListResponse, DropUpdate, Search, SearchInput } from './types';

/** Running searches are polled at this interval, as the spec asks. */
export const POLL_MS = 2000;

export const keys = {
  searches: ['searches'] as const,
  search: (id: string) => ['searches', id] as const,
  companies: (id: string, filters: Omit<CompaniesQuery, 'cursor'>) => ['searches', id, 'companies', filters] as const,
  me: ['me'] as const,
  apiKeys: ['api-keys'] as const,
  drops: ['drops'] as const,
  webhooks: ['webhooks'] as const,
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

export function useDrops() {
  return useQuery({ queryKey: keys.drops, queryFn: api.listDrops });
}

/** Puts a changed drop into the cached list. */
function useStoreDrop() {
  const client = useQueryClient();
  return (drop: Drop): void => {
    client.setQueryData<DropListResponse>(keys.drops, (list) =>
      list
        ? {
            ...list,
            drops: list.drops.some((d) => d.id === drop.id)
              ? list.drops.map((d) => (d.id === drop.id ? drop : d))
              : [drop, ...list.drops],
          }
        : list,
    );
  };
}

export function useCreateDrop() {
  const store = useStoreDrop();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: DropInput) => api.createDrop(input),
    onSuccess: (drop) => {
      store(drop);
      // The first run lands within a minute.
      for (const ms of [0, 20_000, 65_000]) {
        setTimeout(() => void client.invalidateQueries({ queryKey: keys.searches, exact: true }), ms);
      }
    },
  });
}

export function useUpdateDrop() {
  const store = useStoreDrop();
  return useMutation({
    mutationFn: ({ id, update }: { id: string; update: DropUpdate }) => api.updateDrop(id, update),
    onSuccess: store,
  });
}

/**
 * Runs a drop now. The worker picks it up within a minute, so the searches
 * list is refreshed a little later to show what it delivered.
 */
export function useRunDrop() {
  const store = useStoreDrop();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.runDrop(id),
    onSuccess: (drop) => {
      store(drop);
      for (const ms of [20_000, 65_000]) {
        setTimeout(() => {
          void client.invalidateQueries({ queryKey: keys.searches, exact: true });
          void client.invalidateQueries({ queryKey: keys.drops });
        }, ms);
      }
    },
  });
}

export function useDeleteDrop() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteDrop(id),
    onSuccess: (_void, id) => {
      client.setQueryData<DropListResponse>(keys.drops, (list) => (list ? { ...list, drops: list.drops.filter((d) => d.id !== id) } : list));
    },
  });
}

export function useWebhooks() {
  return useQuery({ queryKey: keys.webhooks, queryFn: api.listWebhooks });
}

export function useCreateWebhook() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateWebhookRequest) => api.createWebhook(input),
    onSuccess: (created) => {
      // Never keep the secret in the cache: only the listed shape.
      const { secret: _secret, ...listed } = created;
      client.setQueryData<Webhook[]>(keys.webhooks, (list) => (list ? [listed, ...list] : [listed]));
    },
  });
}

export function useUpdateWebhook() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, update }: { id: string; update: UpdateWebhookRequest }) => api.updateWebhook(id, update),
    onSuccess: (webhook) => {
      client.setQueryData<Webhook[]>(keys.webhooks, (list) => list?.map((w) => (w.id === webhook.id ? webhook : w)));
    },
  });
}

export function useDeleteWebhook() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteWebhook(id),
    onSuccess: (_void, id) => {
      client.setQueryData<Webhook[]>(keys.webhooks, (list) => list?.filter((w) => w.id !== id));
    },
  });
}

/** Sends a signed ping. The answer is shown, not cached. */
export function useTestWebhook() {
  return useMutation({ mutationFn: (id: string) => api.testWebhook(id) });
}
