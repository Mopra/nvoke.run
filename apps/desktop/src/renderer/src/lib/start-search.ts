import { toast } from 'sonner';
import { searchTitle } from './format';
import type { IcpSearchParams } from '@nvoke/shared';
import { useCreateSearch, useUpdateSearch } from './queries';
import { navigate } from './router';
import type { SearchInput } from './types';

/**
 * Starts a search the way New search does: one POST, the search goes into
 * the cached list, a toast names it and the app opens its results in place
 * of New search. The manual form and the website suggestions both start
 * through here.
 */
export function useStartSearch() {
  const create = useCreateSearch();
  function start(input: SearchInput): void {
    if (create.isPending) return;
    create.mutate(input, {
      onSuccess: (search) => {
        toast.success('Search started', { description: searchTitle(search) });
        navigate({ name: 'search', id: search.id }, { replace: true });
      },
      onError: (err) => toast.error('Couldn’t start the search', { description: err.message }),
    });
  }
  return { start, isPending: create.isPending, pendingInput: create.isPending ? create.variables : undefined };
}

/** What Sonar asks for: up to the plan's search cap, and it keeps filling. */
export const ICP_LIMIT = 1000;

/**
 * Starts a plain words (`icp`) search and, when `ongoing`, switches it to keep
 * finding new leads (`PATCH /v1/searches/:id`). The search opens either way;
 * a failed switch only says so, the search itself runs.
 */
export function useStartIcp() {
  const create = useCreateSearch();
  const update = useUpdateSearch();
  function start(params: IcpSearchParams, { ongoing, limit = ICP_LIMIT }: { ongoing: boolean; limit?: number }): void {
    if (create.isPending) return;
    create.mutate(
      { kind: 'icp', params, limit },
      {
        onSuccess: (search) => {
          toast.success('Finding leads', { description: searchTitle(search) });
          navigate({ name: 'search', id: search.id }, { replace: true });
          // Errors toast in the hook, since this screen is gone by then.
          if (ongoing) update.mutate({ id: search.id, ongoing: true });
        },
        onError: (err) => toast.error('Couldn’t start the search', { description: err.message }),
      },
    );
  }
  return { start, isPending: create.isPending };
}
