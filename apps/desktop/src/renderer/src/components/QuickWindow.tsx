import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Loader2 } from 'lucide-react';
import { Commands } from '@/components/CommandBar';
import { progressCaption, SearchProgress } from '@/components/SearchProgress';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { useAuth } from '@/lib/auth';
import { quickApi } from '@/lib/desktop';
import { formatNumber, isActive, searchTitle } from '@/lib/format';
import { useCreateSearch, useSearch } from '@/lib/queries';
import type { Search, SearchInput } from '@/lib/types';

/** Window margin that leaves room for the panel's shadow. */
const MARGIN = 20;

/**
 * What the global shortcut opens: the command bar in a small glass window
 * over any app. Enter on typed text starts a search and the window shows its
 * progress; Open in nvoke (Enter again) brings up the main window on it.
 * Esc hides the window and the previous app gets its focus back.
 */
export function QuickWindow() {
  const auth = useAuth();
  // Bumped on every show, so each opening starts on a fresh command bar.
  const [opening, setOpening] = useState(0);
  const panel = useRef<HTMLDivElement>(null);
  const quick = quickApi();

  useEffect(() => quick?.onShown(() => setOpening((n) => n + 1)), [quick]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        quick?.hide();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [quick]);

  // The window is exactly as tall as its panel.
  useEffect(() => {
    const el = panel.current;
    if (!el || !quick) return;
    const fit = (): void => quick.setHeight(el.getBoundingClientRect().height + MARGIN);
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    fit();
    return () => observer.disconnect();
  }, [quick, auth?.status, opening]);

  return (
    <div className="p-2.5">
      <div ref={panel} className="overflow-hidden rounded-[28px] glass-strong text-popover-foreground">
        {auth === undefined ? (
          <div className="flex h-20 items-center justify-center">
            <Loader2 className="size-5 text-muted-foreground motion-safe:animate-spin" />
          </div>
        ) : auth.status === 'signed-in' ? (
          <Session key={opening} />
        ) : (
          <SignedOut />
        )}
      </div>
    </div>
  );
}

function SignedOut() {
  return (
    <div className="flex items-center gap-6 px-6 py-5">
      <div className="min-w-0 flex-1">
        <div className="font-display text-xl tracking-[-0.02em]">Sign in to nvoke</div>
        <div className="mt-1 text-sm text-muted-foreground">Then search from anywhere.</div>
      </div>
      <Button onClick={() => quickApi()?.openInMain('#/')}>Open nvoke</Button>
    </div>
  );
}

/** The command bar until a search starts, then that search's progress. */
function Session() {
  const create = useCreateSearch();
  const [started, setStarted] = useState<string | null>(null);

  function start(input: SearchInput): void {
    if (create.isPending) return;
    create.mutate(input, { onSuccess: (search) => setStarted(search.id) });
  }

  if (started) return <Running id={started} onNew={() => setStarted(null)} />;

  return (
    <Commands
      onDone={() => quickApi()?.hide()}
      onStart={start}
      notice={create.isError ? create.error.message : null}
    />
  );
}

function Running({ id, onNew }: { id: string; onNew: () => void }) {
  const { data: search } = useSearch(id);

  const open = (): void => quickApi()?.openInMain(`#/searches/${encodeURIComponent(id)}`);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Enter') {
        event.preventDefault();
        open();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="px-6 pt-5 pb-5">
      {search ? <Progress search={search} /> : <Loader2 className="size-5 text-muted-foreground motion-safe:animate-spin" />}
      <div className="mt-5 flex items-center justify-between">
        <Button variant="ghost" onClick={onNew}>
          New search
        </Button>
        <Button onClick={open} autoFocus>
          Open in nvoke
          <ArrowUpRight className="size-3.5 opacity-70" />
          <Kbd className="ml-1 bg-primary-foreground/15 text-primary-foreground/80">↵</Kbd>
        </Button>
      </div>
    </div>
  );
}

function Progress({ search }: { search: Search }) {
  return (
    <>
      <div className="flex items-baseline justify-between gap-4">
        <div className="truncate font-display text-xl tracking-[-0.02em]">{searchTitle(search)}</div>
        <div className="shrink-0 text-sm tabular-nums text-muted-foreground">
          {formatNumber(search.emailsFound)} emails
          {isActive(search.status) ? '' : `, ${formatNumber(search.emailsValid)} valid`}
        </div>
      </div>
      <SearchProgress search={search} className="mt-4" />
      <div className="mt-2.5 text-sm text-muted-foreground">
        {search.status === 'failed' ? 'The search failed' : search.status === 'done' ? 'Done' : progressCaption(search)}
      </div>
    </>
  );
}
