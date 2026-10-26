import { useEffect, useRef } from 'react';
import { useInfiniteQuery, useMutation, useMutationState, useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, ApiError } from './api';
import { isActive } from './format';
import { inboxPollMs } from './people';
import type { AiKey, ApiKey, CreateWebhookRequest, SaveAiKeyRequest, SaveSearchKeyRequest, SearchKey, SiteProfile, UpdateSiteProfileRequest, UpdateWebhookRequest, Webhook } from '@nvoke/shared';
import type { CompaniesPage, CompaniesQuery, DraftOpenersInput, Drop,DropInput, DropListResponse, DropUpdate, Search, SearchInput } from './types';

/** Running searches are polled at this interval, as the spec asks. */
export const POLL_MS = 2000;
/** An ongoing search that ended still adds a few leads a day: a slow look now and then. */
export const ONGOING_POLL_MS = 60_000;

export const keys = {
  searches: ['searches'] as const,
  search: (id: string) => ['searches', id] as const,
  companies: (id: string, filters: Omit<CompaniesQuery, 'cursor'>) => ['searches', id, 'companies', filters] as const,
  me: ['me'] as const,
  apiKeys: ['api-keys'] as const,
  drops: ['drops'] as const,
  webhooks: ['webhooks'] as const,
  local: ['local'] as const,
  findLeads: (q: string) => ['local-find', q] as const,
  siteProfile: ['site-profile'] as const,
  aiKey: ['ai-key'] as const,
  searchKey: ['search-key'] as const,
};

/** The build mutation's key, so any screen can see a build that is still running. */
export const BUILD_SITE_PROFILE = ['site-profile', 'build'] as const;

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
    refetchInterval: (query) => {
      const search = query.state.data;
      if (!search) return false;
      return isActive(search.status) ? POLL_MS : search.ongoing ? ONGOING_POLL_MS : false;
    },
    retry: (count, error) => !(error instanceof ApiError && error.status === 404) && count < 2,
  });
}

/** While live, every this many polls the whole list is read again, so rows past the loaded pages show up. */
const FULL_REFRESH_EVERY = 8;

/**
 * A search's companies, page by page. While the search runs only the first
 * page is polled every POLL_MS (new rows, the total and the next cursor),
 * not every page loaded so far; when rows were added beyond the last loaded
 * page, the whole list is read again now and then. The full refresh when the
 * search ends comes from useRefreshWhenFinished.
 */
export function useCompanies(id: string, filters: Omit<CompaniesQuery, 'cursor'>, live: boolean) {
  const client = useQueryClient();
  const key = keys.companies(id, filters);
  const query = useInfiniteQuery({
    queryKey: key,
    queryFn: ({ pageParam }) => api.listCompanies(id, { ...filters, cursor: pageParam }, live),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    placeholderData: (previous) => previous,
  });
  const keyText = JSON.stringify(key);
  useEffect(() => {
    if (!live) return;
    const queryKey = JSON.parse(keyText) as typeof key;
    let ticks = 0;
    let stopped = false;
    const timer = setInterval(() => {
      ticks += 1;
      void api.listCompanies(id, { ...filters }, true).then(
        (first) => {
          if (stopped) return;
          let behind = false;
          client.setQueryData<InfiniteData<CompaniesPage, string | undefined>>(queryKey, (data) => {
            if (!data || data.pages.length === 0) return data;
            const loaded = data.pages.slice(1).reduce((n, p) => n + p.companies.length, first.companies.length);
            const last = data.pages[data.pages.length - 1]!;
            behind = data.pages.length > 1 && last.nextCursor === null && first.total > loaded;
            return { ...data, pages: [first, ...data.pages.slice(1)] };
          });
          if (behind && ticks % FULL_REFRESH_EVERY === 0) void client.invalidateQueries({ queryKey, exact: true });
        },
        () => undefined,
      );
    }, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
    // `filters` is part of the key text.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, live, keyText, client]);
  return query;
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

/** Drafting openers is followed at this interval until none is queued. */
export const OPENER_POLL_MS = 2500;

/** Re-reads a search's companies: the local copy first (main only refetches when told), then the cache. */
async function reloadCompanies(client: ReturnType<typeof useQueryClient>, id: string): Promise<void> {
  await api.refreshLocal(id);
  await client.invalidateQueries({ queryKey: [...keys.search(id), 'companies'] });
}

/** Queues openers for a search, or for some of its companies, and shows them as queued. */
export function useDraftOpeners(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: DraftOpenersInput) => api.draftOpeners(id, body),
    onSuccess: () => reloadCompanies(client, id),
  });
}

/**
 * While a loaded company's opener is queued, re-reads the companies every
 * OPENER_POLL_MS until none is. A running search polls on its own already.
 */
export function useFollowOpeners(id: string, drafting: boolean, live: boolean): void {
  const client = useQueryClient();
  useEffect(() => {
    if (!drafting || live) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = (): void => {
      timer = setTimeout(() => {
        void reloadCompanies(client, id).finally(() => {
          if (!stopped) tick();
        });
      }, OPENER_POLL_MS);
    };
    tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [id, drafting, live, client]);
}

/** How the local copy stands: counts, last sync and whether the server answered. */
export function useLocalStatus() {
  return useQuery({ queryKey: keys.local, queryFn: api.localStatus, staleTime: Infinity });
}

/**
 * Follows the local copy while signed in: keeps `useLocalStatus` current and
 * re-reads the companies of every search a sync changed, so an open search
 * switches to the local copy the moment it lands and loses an address the
 * server dropped.
 */
export function useLocalSync(): void {
  const client = useQueryClient();
  useEffect(
    () =>
      api.onLocalChange((change) => {
        client.setQueryData(keys.local, change.status);
        for (const id of change.searchIds) void client.invalidateQueries({ queryKey: [...keys.search(id), 'companies'] });
        if (change.searchesChanged) void client.invalidateQueries({ queryKey: keys.searches, exact: true });
        void client.invalidateQueries({ queryKey: ['local-find'] });
      }),
    [client],
  );
}

/**
 * Companies across every search in the local copy whose name, domain or an
 * address contains `q`. Off below two characters. Keeps the last answer while
 * the next one comes, so the list does not flicker as you type.
 */
export function useFindLeads(q: string, limit = 6) {
  const text = q.trim();
  return useQuery({
    queryKey: keys.findLeads(text),
    queryFn: () => api.findLeads(text, limit),
    enabled: text.length >= 2,
    placeholderData: (previous) => previous,
    staleTime: 30_000,
  });
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

/** Another run in an ended search. The search goes live again in place, in the list too. */
export function useSearchMore(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: SearchInput) => api.searchMore(id, input),
    onSuccess: (search) => {
      client.setQueryData(keys.search(search.id), search);
      client.setQueryData<Search[]>(keys.searches, (list) => list?.map((s) => (s.id === search.id ? search : s)));
      void client.invalidateQueries({ queryKey: [...keys.search(search.id), 'companies'] });
    },
  });
}

/** The update mutation's key, so any screen can see a switch still in flight. */
export const UPDATE_SEARCH = ['searches', 'update'] as const;

/**
 * Switches an ongoing search on or off. The cache flips at once and rolls
 * back on failure. Errors toast here, at the hook, so one that lands after
 * the screen that asked has gone (New search, the quick window) still shows.
 */
export function useUpdateSearch() {
  const client = useQueryClient();
  const put = (search: Search): void => {
    client.setQueryData(keys.search(search.id), search);
    client.setQueryData<Search[]>(keys.searches, (list) => list?.map((s) => (s.id === search.id ? search : s)));
  };
  return useMutation({
    mutationKey: UPDATE_SEARCH,
    mutationFn: ({ id, ongoing }: { id: string; ongoing: boolean }) => api.updateSearch(id, { ongoing }),
    onMutate: ({ id, ongoing }) => {
      const before = client.getQueryData<Search>(keys.search(id));
      if (before) put({ ...before, ongoing });
      return { before };
    },
    onError: (err, { ongoing }, context) => {
      if (context?.before) put(context.before);
      toast.error(ongoing ? 'Couldn’t keep it finding new leads' : 'Couldn’t stop it finding new leads', {
        description: `${err.message} Try the switch on the results.`,
      });
    },
    onSuccess: put,
  });
}

/** The shared inbox switch's mutation key. */
export const CHECK_INBOXES = ['searches', 'check-inboxes'] as const;

/**
 * Switches on checking a search's shared inboxes (`PATCH /v1/searches/:id
 * { checkInboxes: true }`). The server queues the ones it skipped; the
 * screen follows them with useFollowInboxChecks.
 */
export function useCheckInboxes() {
  const client = useQueryClient();
  return useMutation({
    mutationKey: CHECK_INBOXES,
    mutationFn: ({ id }: { id: string }) => api.updateSearch(id, { checkInboxes: true }),
    onSuccess: async (search) => {
      client.setQueryData(keys.search(search.id), search);
      client.setQueryData<Search[]>(keys.searches, (list) => list?.map((s) => (s.id === search.id ? search : s)));
      await reloadCompanies(client, search.id);
    },
  });
}

/**
 * Re-reads an ended search and its companies while the shared inbox checks
 * it asked for at `since` settle (inboxPollMs: fast at first, then slower).
 * The screen passes null once none is pending or the follow ran out.
 */
export function useFollowInboxChecks(id: string, since: number | null, live: boolean): void {
  const client = useQueryClient();
  useEffect(() => {
    if (since === null || live) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = (): void => {
      timer = setTimeout(() => {
        // The counters move too: a valid inbox counts as a verified email, and inboxesPending says when to stop.
        void client.invalidateQueries({ queryKey: keys.search(id), exact: true });
        void reloadCompanies(client, id).finally(() => {
          if (!stopped) tick();
        });
      }, inboxPollMs(since, Date.now()));
    };
    tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [id, since, live, client]);
}

/** True while an ongoing switch for this search is on its way, from any screen. */
export function useUpdatingSearch(id: string): boolean {
  return useMutationState({
    filters: { mutationKey: UPDATE_SEARCH, status: 'pending' },
    select: (m) => (m.state.variables as { id: string } | undefined)?.id,
  }).includes(id);
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

/** The account's site profile; null before the first build. */
export function useSiteProfile() {
  return useQuery({ queryKey: keys.siteProfile, queryFn: api.getSiteProfile, staleTime: 5 * 60_000 });
}

/**
 * Reads a website and plans searches (10 to 30 seconds). The result lands in
 * the cache here, not in the caller, so it arrives even when the user left
 * New search while it ran.
 */
export function useBuildSiteProfile() {
  const client = useQueryClient();
  return useMutation({
    mutationKey: BUILD_SITE_PROFILE,
    mutationFn: (website: string) => api.buildSiteProfile(website),
    onSuccess: (profile) => client.setQueryData<SiteProfile | null>(keys.siteProfile, profile),
  });
}

export function useUpdateSiteProfile() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (update: UpdateSiteProfileRequest) => api.updateSiteProfile(update),
    onSuccess: (profile) => client.setQueryData<SiteProfile | null>(keys.siteProfile, profile),
  });
}

export function useDeleteSiteProfile() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api.deleteSiteProfile(),
    onSuccess: () => client.setQueryData<SiteProfile | null>(keys.siteProfile, null),
  });
}

/** The account's own Anthropic key, or null while it runs on nvoke's. */
export function useAiKey() {
  return useQuery({ queryKey: keys.aiKey, queryFn: api.getAiKey, staleTime: 5 * 60_000 });
}

export function useSaveAiKey() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: SaveAiKeyRequest) => api.saveAiKey(input),
    onSuccess: (key) => client.setQueryData<AiKey | null>(keys.aiKey, key),
  });
}

export function useDeleteAiKey() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api.deleteAiKey(),
    onSuccess: () => client.setQueryData<AiKey | null>(keys.aiKey, null),
  });
}

/** The account's own Serper or Brave key, or null while it searches on nvoke's. */
export function useSearchKey() {
  return useQuery({ queryKey: keys.searchKey, queryFn: api.getSearchKey, staleTime: 5 * 60_000 });
}

export function useSaveSearchKey() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: SaveSearchKeyRequest) => api.saveSearchKey(input),
    onSuccess: (key) => client.setQueryData<SearchKey | null>(keys.searchKey, key),
  });
}

export function useDeleteSearchKey() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api.deleteSearchKey(),
    onSuccess: () => client.setQueryData<SearchKey | null>(keys.searchKey, null),
  });
}
