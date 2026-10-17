import { toast } from 'sonner';
import { searchTitle } from './format';
import { useCreateSearch } from './queries';
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
