import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Check, Copy, Loader2 } from 'lucide-react';
import { Commands } from '@/components/CommandBar';
import { GrabPanel } from '@/components/GrabPanel';
import { progressCaption, SearchProgress } from '@/components/SearchProgress';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { useAuth } from '@/lib/auth';
import { grabApi, quickApi } from '@/lib/desktop';
import { formatNumber, isActive, searchTitle } from '@/lib/format';
import { useCompanies, useCreateSearch, useSearch } from '@/lib/queries';
import type { Search, SearchInput } from '@/lib/types';
import type { FrontTab, GrabState, QuickClipboard } from '../../../ipc/contract';

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
  // What the clipboard named when the window opened, never read in the background.
  const [clipboard, setClipboard] = useState<QuickClipboard>(null);
  // The site in the browser tab that was in front, read only on the shortcut. Arrives just after the show.
  const [frontTab, setFrontTab] = useState<FrontTab | null>(null);
  // A screen grab in progress or its result. A plain opening clears it.
  const [grab, setGrab] = useState<GrabState | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const quick = quickApi();

  useEffect(
    () =>
      quick?.onShown((clip) => {
        setClipboard(clip);
        setFrontTab(null);
        setGrab(null);
        setOpening((n) => n + 1);
      }),
    [quick],
  );

  useEffect(() => quick?.onFrontTab(setFrontTab), [quick]);
  useEffect(() => grabApi()?.onState(setGrab), []);

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
  }, [quick, auth?.status, opening, grab]);

  return (
    <div className="p-2.5">
      <div ref={panel} className="overflow-hidden rounded-[28px] glass-strong text-popover-foreground">
        {auth === undefined ? (
          <div className="flex h-20 items-center justify-center">
            <Loader2 className="size-5 text-muted-foreground motion-safe:animate-spin" />
          </div>
        ) : auth.status === 'signed-in' ? (
          <Session key={opening} clipboard={clipboard} frontTab={frontTab} grab={grab} onGrabClose={() => setGrab(null)} />
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

/** The command bar (or a screen grab's list) until a search starts, then that search's progress. */
function Session({
  clipboard,
  frontTab,
  grab,
  onGrabClose,
}: {
  clipboard: QuickClipboard;
  frontTab: FrontTab | null;
  grab: GrabState | null;
  onGrabClose: () => void;
}) {
  const create = useCreateSearch();
  const [started, setStarted] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function start(input: SearchInput): void {
    if (create.isPending) return;
    setNotice(null);
    create.mutate(input, { onSuccess: (search) => setStarted(search.id) });
  }

  /** macOS: asks for the Automation permission (the OS prompt), then looks the site up. */
  async function readFrontTab(): Promise<void> {
    const tab = await quickApi()?.readFrontTab();
    if (tab?.status === 'read') start({ kind: 'domains', params: { items: [tab.domain] }, limit: 1 });
    else if (tab?.status === 'denied') setNotice(automationHelp(tab.browser));
    else setNotice('Couldn’t read the address of the front tab.');
  }


  if (started) {
    return (
      <Running
        id={started}
        onNew={() => {
          setStarted(null);
          onGrabClose();
        }}
      />
    );
  }

  if (grab) return <GrabPanel state={grab} onStart={start} onBack={onGrabClose} notice={create.isError ? create.error.message : notice} pending={create.isPending} />;

  const grabber = grabApi();
  return (
    <Commands
      onDone={() => quickApi()?.hide()}
      onStart={start}
      notice={create.isError ? create.error.message : notice}
      clipboard={clipboard}
      frontTab={frontTab}
      onReadFrontTab={() => void readFrontTab()}
      onFrontTabDenied={(browser) => setNotice(automationHelp(browser))}
      onGrab={grabber ? () => grabber.start() : undefined}
    />
  );
}

function automationHelp(browser: string): string {
  return `macOS keeps nvoke from reading ${browser}. Allow it in System Settings, Privacy & Security, Automation.`;
}

function Running({ id, onNew }: { id: string; onNew: () => void }) {
  const { data: search } = useSearch(id);

  const open = (): void => quickApi()?.openInMain(`#/searches/${encodeURIComponent(id)}`);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      // A focused button answers Enter itself, so it must not also open the search.
      if (event.key === 'Enter' && !(event.target instanceof Element && event.target.closest('button'))) {
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
      {search?.kind === 'domains' && <Addresses id={id} search={search} />}
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

/** The addresses a one-domain lookup found, as they arrive, each with a copy button. */
function Addresses({ id, search }: { id: string; search: Search }) {
  const live = isActive(search.status);
  const { data } = useCompanies(id, {}, live);
  const addresses = (data?.pages.flatMap((page) => page.companies) ?? [])
    .flatMap((company) => company.emails)
    .filter((email) => email.verification !== 'invalid');
  if (addresses.length === 0) {
    if (live) return null;
    return <div className="mt-4 text-sm text-muted-foreground">No addresses found on this site.</div>;
  }
  return (
    <ul className="mt-4 max-h-56 overflow-y-auto">
      {addresses.map((email) => (
        <Address key={email.id} address={email.address} />
      ))}
    </ul>
  );
}

function Address({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // The clipboard can refuse; the address stays selectable.
    }
  }
  return (
    <li className="flex h-10 items-center gap-2 rounded-[16px] pr-1.5 pl-3 hover:bg-foreground/[0.05]">
      <code className="min-w-0 flex-1 truncate font-mono text-sm select-all">{address}</code>
      <Button variant="ghost" size="icon-sm" onClick={() => void copy()} aria-label={`Copy ${address}`}>
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </Button>
    </li>
  );
}

function Progress({ search }: { search: Search }) {
  return (
    <>
      <div className="flex items-baseline justify-between gap-4">
        <div className="truncate font-display text-xl tracking-[-0.02em]" title={searchTitle(search)}>
          {searchTitle(search)}
        </div>
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
