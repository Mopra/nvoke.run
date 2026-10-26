'use client';

import { useId, useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { SEARCH_KEY_PROVIDERS, type SearchKey, type SearchKeyProvider } from '@nvoke/shared';
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
import { Skeleton } from '@/components/ui/skeleton';
import { providerLabel, saveSearchKeyBody, searchKeyErrorMessage, searchKeyStatus } from '@/lib/app/search-key';
import { useDeleteSearchKey, useSaveSearchKey, useSearchKey } from '@/lib/app/queries';
import { cn } from '@/lib/utils';

function Status({ searchKey }: { searchKey: SearchKey | null }) {
  return (
    <div className="flex items-start gap-3 py-5">
      <span className={cn('led mt-1.5', searchKey && 'led-on')} />
      <div className="min-w-0 text-[15px]">{searchKeyStatus(searchKey)}</div>
    </div>
  );
}

/** Serper or Brave as channel rows: an LED, the name and its hint. Native radios, so arrow keys work. */
function ProviderChoice({ value, onChange }: { value: SearchKeyProvider; onChange: (provider: SearchKeyProvider) => void }) {
  const name = useId();
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-medium">Provider</legend>
      <div className="flex flex-col divide-y divide-border border-y border-border">
        {SEARCH_KEY_PROVIDERS.map((p, i) => {
          const active = p.id === value;
          return (
            <label
              key={p.id}
              className="flex cursor-pointer items-start gap-3 rounded-sm py-3 outline-none has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring/50"
            >
              <input type="radio" name={name} value={p.id} checked={active} onChange={() => onChange(p.id)} className="sr-only" />
              <span aria-hidden className={cn('led mt-1.5', active && 'led-on')} />
              <span className="min-w-0">
                <span className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-[15px]">{p.label}</span>
                  {i === 0 && <span className="font-mono text-[11px] tracking-[0.04em] text-muted-foreground uppercase">Recommended</span>}
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{p.hint}</span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function RemoveDialog({ open, onOpenChange, onRemoved }: { open: boolean; onOpenChange: (open: boolean) => void; onRemoved: () => void }) {
  const remove = useDeleteSearchKey();
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove your search key?</AlertDialogTitle>
          <AlertDialogDescription>nvoke forgets it and runs your web searches on its own key again.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep it</AlertDialogCancel>
          <AlertDialogAction
            onClick={() =>
              remove.mutate(undefined, {
                onSuccess: () => {
                  onRemoved();
                  toast.success('Key removed');
                },
                onError: (err) => toast.error('Couldn’t remove the key', { description: err.message }),
              })
            }
          >
            Remove
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** The form. Saving always sends a key, since it replaces the stored one. */
function SearchKeyForm({ searchKey }: { searchKey: SearchKey | null }) {
  const save = useSaveSearchKey();
  const keyId = useId();
  const errorId = useId();
  const [provider, setProvider] = useState<SearchKeyProvider>(searchKey?.provider ?? 'serper');
  const [apiKey, setApiKey] = useState('');
  const [removing, setRemoving] = useState(false);

  const canSave = !save.isPending && apiKey.trim() !== '';

  function submit(e: FormEvent): void {
    e.preventDefault();
    if (!canSave) return;
    save.mutate(saveSearchKeyBody({ provider, apiKey }), {
      onSuccess: (saved) => {
        // Never keep the key on screen once it is stored.
        setApiKey('');
        setProvider(saved.provider);
        toast.success('Key saved');
      },
    });
  }

  const error = save.error ? searchKeyErrorMessage(save.error, provider) : null;

  return (
    <form onSubmit={submit} className="flex flex-col gap-6 pt-5 pb-6">
      <ProviderChoice
        value={provider}
        onChange={(next) => {
          setProvider(next);
          if (save.isError) save.reset();
        }}
      />
      <div className="flex flex-col gap-2">
        <Label htmlFor={keyId}>{searchKey ? 'Replace key' : `${providerLabel(provider)} API key`}</Label>
        <Input
          id={keyId}
          type="password"
          value={apiKey}
          onChange={(e) => {
            setApiKey(e.target.value);
            if (save.isError) save.reset();
          }}
          autoComplete="off"
          spellCheck={false}
          className="font-mono"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
        />
        {searchKey && <p className="text-xs text-muted-foreground">Saving replaces the stored key.</p>}
      </div>
      {error && (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button type="submit" variant="dark" disabled={!canSave}>
          {save.isPending && <Loader2 className="motion-safe:animate-spin" />}
          {save.isPending ? `Checking with ${providerLabel(provider)}` : 'Save key'}
        </Button>
        {searchKey && (
          <Button type="button" variant="ghost" onClick={() => setRemoving(true)}>
            Remove key
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Serper or Brave bills the searches made on your key. Results are cached and shared. When the key is refused, searches fail instead of using
        ours.
      </p>
      <RemoveDialog open={removing} onOpenChange={setRemoving} onRemoved={() => save.reset()} />
    </form>
  );
}

/** "Your own search key": run nvoke's paid web searches on the account's Serper or Brave key. */
export function SearchKeySetting() {
  const { data: searchKey, error, isPending, refetch } = useSearchKey();

  if (isPending) {
    return (
      <div className="flex flex-col gap-3 py-5">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-3 w-64" />
      </div>
    );
  }
  if (error) {
    return (
      <p className="py-5 text-sm text-muted-foreground">
        Couldn’t load your search key.{' '}
        <button
          type="button"
          className="rounded-sm text-foreground underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/50"
          onClick={() => void refetch()}
        >
          Try again
        </button>
      </p>
    );
  }
  return (
    <div className="flex flex-col divide-y divide-border border-y border-border" data-search-key>
      <Status searchKey={searchKey} />
      <SearchKeyForm searchKey={searchKey} />
    </div>
  );
}
