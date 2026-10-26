import { useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { SEARCH_KEY_PROVIDERS, type SearchKeyProvider } from '@nvoke/shared';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Segmented } from '@/components/ui/segmented';
import { ApiError } from '@/lib/api';
import { useDeleteSearchKey, useSaveSearchKey, useSearchKey } from '@/lib/queries';

const FIELD = 'h-9 rounded-[4px] bg-card px-3 font-mono text-[13px] shadow-[inset_0_1px_2px_var(--shadow-strong)]';

function providerLabel(id: SearchKeyProvider): string {
  return SEARCH_KEY_PROVIDERS.find((p) => p.id === id)?.label ?? id;
}

/**
 * Plain words for a failed save. The server's `detail` on `search_key_rejected`
 * is what the engine answered, often free text that main's bridge drops; a
 * short code that survives is shown, else the generic line stands alone.
 */
function saveError(err: Error, provider: SearchKeyProvider): string {
  const name = providerLabel(provider);
  if (err instanceof ApiError && err.code === 'search_key_rejected') {
    const base = `${name} refused that key, or its plan has no credit left. Check it and paste it again.`;
    return err.detail ? `${base} It said: ${err.detail}.` : base;
  }
  if (err instanceof ApiError && err.code === 'source_unavailable') return `${name} isn’t answering right now. Try again in a minute.`;
  return err.message;
}

/**
 * Your own search key: the account's paid web searches run on a Serper or
 * Brave key the user pastes. The server tries it with one search, keeps it
 * sealed and only sends back its last 4 characters.
 */
export function SearchKey() {
  const { data: searchKey, isPending } = useSearchKey();
  const save = useSaveSearchKey();
  const remove = useDeleteSearchKey();
  const [apiKey, setApiKey] = useState('');
  // null follows the stored provider (or Serper); a pick overrides it until saved.
  const [picked, setPicked] = useState<SearchKeyProvider | null>(null);
  const [confirming, setConfirming] = useState(false);

  const provider = picked ?? searchKey?.provider ?? 'serper';
  const hint = SEARCH_KEY_PROVIDERS.find((p) => p.id === provider)?.hint;
  const typed = apiKey.trim();
  const canSave = !save.isPending && typed.length > 0;

  function submit(e: FormEvent): void {
    e.preventDefault();
    if (!canSave) return;
    save.mutate(
      { provider, apiKey: typed },
      {
        onSuccess: (saved) => {
          setApiKey('');
          setPicked(null);
          toast.success('Search key saved', { description: `${providerLabel(saved.provider)} key ending in ${saved.last4}` });
        },
      },
    );
  }

  function doRemove(): void {
    remove.mutate(undefined, {
      onSuccess: () => {
        setPicked(null);
        toast.success('Key removed', { description: 'Web searches run on nvoke’s key again.' });
      },
      onError: (err) => toast.error('Couldn’t remove the key', { description: err.message }),
    });
  }

  return (
    <div className="flex flex-col gap-5 py-5">
      <div className="flex items-start gap-8">
        <div className="min-w-0 flex-1">
          <div className="font-mono text-[11px] font-medium tracking-[0.08em] uppercase">Your own search key</div>
          <div className="mt-1 text-xs text-muted-foreground">
            {isPending ? (
              'Checking…'
            ) : searchKey ? (
              <>
                {providerLabel(searchKey.provider)} key ending in <span className="font-mono text-foreground">{searchKey.last4}</span>.
              </>
            ) : (
              'Searching on nvoke’s key.'
            )}
          </div>
        </div>
        {searchKey && (
          <Button variant="outline" className="shrink-0" onClick={() => setConfirming(true)} disabled={remove.isPending}>
            {remove.isPending && <Loader2 className="motion-safe:animate-spin" />}
            Remove key
          </Button>
        )}
      </div>

      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label>Search engine</Label>
          <Segmented<SearchKeyProvider>
            label="Search engine"
            size="sm"
            className="self-start"
            value={provider}
            onChange={(v) => {
              setPicked(v);
              save.reset();
            }}
            options={SEARCH_KEY_PROVIDERS.map((p) => ({ value: p.id, label: p.label }))}
          />
          <p className="text-xs text-muted-foreground">
            {provider === 'serper' && 'Recommended. '}
            {hint}
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="search-key">{searchKey ? 'Replace key' : `${providerLabel(provider)} API key`}</Label>
          <Input
            id="search-key"
            type="password"
            value={apiKey}
            onChange={(e) => {
              setApiKey(e.target.value);
              save.reset();
            }}
            maxLength={400}
            placeholder="Paste the key"
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            className={FIELD}
          />
        </div>
        {save.error && (
          <p role="alert" className="text-xs text-destructive">
            {saveError(save.error, provider)}
          </p>
        )}
        <div className="flex items-center gap-4">
          <p className="min-w-0 flex-1 text-xs text-muted-foreground">
            Searches on your key are billed by Serper or Brave. Results are cached and shared. A refused key fails the search
            instead of using ours.
          </p>
          <Button type="submit" className="shrink-0" disabled={!canSave}>
            {save.isPending && <Loader2 className="motion-safe:animate-spin" />}
            Save key
          </Button>
        </div>
      </form>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove your search key?</AlertDialogTitle>
            <AlertDialogDescription>
              nvoke forgets the {searchKey ? providerLabel(searchKey.provider) : ''} key ending in {searchKey?.last4}. Web searches
              run on nvoke’s key again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={doRemove}>Remove key</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
