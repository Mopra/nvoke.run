'use client';

import { useEffect, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { useClerk } from '@clerk/nextjs';
import { ArrowUpRight, Check, Copy, Download, Loader2, LogOut, Monitor, Moon, Plus, Sun } from 'lucide-react';
import { toast } from 'sonner';
import { FREE_PLAN, PLANS, type ApiKey, type MeResponse } from '@nvoke/shared';
import { Avatar } from '@/components/app/avatar';
import { LogoLoader, useArrivals, useTweened } from '@/components/app/motion';
import { APP_FRAME, APP_INSET, BackLink, PageHeader } from '@/components/app/shell';
import { ErrorState } from '@/components/app/states';
import { THEME_STORAGE_KEY } from '@/components/site/theme-script';
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Segmented } from '@/components/ui/segmented';
import { Skeleton } from '@/components/ui/skeleton';
import { apiUrl } from '@/lib/api';
import { formatNumber, periodLabel, relativeTime, resetDate } from '@/lib/app/desktop';
import { BILLING_PATH, planName, quotaState } from '@/lib/app/quota';
import { useApiKeys, useCreateApiKey, useMe, usePlanSync, useRevokeApiKey } from '@/lib/app/queries';
import { cn } from '@/lib/utils';

const MCP_URL = `${apiUrl.replace(/\/$/, '')}/mcp`;

async function copy(text: string, what: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`Copied ${what}`);
    return true;
  } catch {
    toast.error('Couldn’t copy to the clipboard');
    return false;
  }
}

/** A value in monospace on a small screen, with a copy button. Wraps instead of clipping. */
function CopyField({ value, what, className }: { value: string; what: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  async function onCopy(): Promise<void> {
    if (await copy(value, what)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    }
  }
  return (
    <div className={cn('screen flex items-start gap-2 py-2 pr-1.5 pl-3', className)}>
      <code className="min-w-0 flex-1 py-1 font-mono text-xs leading-5 break-all text-screen-foreground select-all">{value}</code>
      <Button
        variant="ghost"
        size="icon-sm"
        className="text-screen-foreground/70 hover:bg-screen-foreground/10 hover:text-screen-foreground"
        onClick={() => void onCopy()}
        aria-label={`Copy ${what}`}
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </Button>
    </div>
  );
}

function SectionHeading({ title, description, action }: { title: string; description: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
      <div className="min-w-0 flex-1">
        <h2 className="font-display text-xl font-light">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/** A setting: what it is on the left, its control on the right. A hairline row, no box. */
function Setting({ label, description, children }: { label: ReactNode; description?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-8 gap-y-3 py-5">
      <div className="min-w-0 flex-1 basis-60">
        <div className="font-mono text-[11px] font-medium tracking-[0.08em] uppercase">{label}</div>
        {description && <div className="mt-1 text-xs text-muted-foreground">{description}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

/* Plan and usage */

/** The usage meter's segments, as many as the desktop's LED meter. */
const SEGMENTS = 16;

/** The month's verified emails: a black screen with the figure lit over ghost digits, PLAN / USED / LEFT and a meter. */
function Usage({ me }: { me: MeResponse }) {
  const quota = quotaState(me);
  const { period } = me.usage;
  const used = useTweened(quota.used);
  const ghost = '8'.repeat(Math.max(3, formatNumber(quota.used).length));
  const lit = Math.min(SEGMENTS, Math.round((quota.share / 100) * SEGMENTS));
  const note =
    quota.level === 'out'
      ? `Out of verified emails for ${periodLabel(period)}. Searches stop at the limit until ${resetDate(period)}. Or upgrade.`
      : `${formatNumber(quota.left)} left in ${periodLabel(period)}. Resets on ${resetDate(period)}.`;
  return (
    <section data-usage className="screen p-4 sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div>
          <div className="cap text-screen-foreground/50">Verified this month</div>
          <div className="relative mt-2 inline-block font-lcd text-[40px] leading-none sm:text-[44px]">
            <span aria-hidden className="absolute inset-y-0 right-0 font-extrabold text-screen-dim">
              {ghost}
            </span>
            <span className="lcd relative tabular-nums">{formatNumber(used)}</span>
          </div>
        </div>
        <dl className="grid grid-cols-[max-content_max-content] gap-x-4 gap-y-0.5 text-right">
          <dt className="cap text-screen-foreground/50">Plan</dt>
          <dd className="cap text-screen-foreground tabular-nums">{formatNumber(quota.limit)}</dd>
          <dt className="cap text-screen-foreground/50">Used</dt>
          <dd className="cap text-screen-foreground tabular-nums">{formatNumber(quota.used)}</dd>
          <dt className="cap text-screen-foreground/50">Left</dt>
          <dd className="cap text-primary tabular-nums">{formatNumber(quota.left)}</dd>
        </dl>
      </div>
      <div
        role="meter"
        aria-label="Verified emails used this month"
        aria-valuemin={0}
        aria-valuemax={quota.limit}
        aria-valuenow={quota.used}
        className="mt-4"
      >
        {/* The meter on the screen: lit segments orange (red near the limit), the rest ghost segments. */}
        <span className="flex gap-[2px]">
          {Array.from({ length: SEGMENTS }, (_, i) => (
            <span
              key={i}
              className={cn(
                'h-2.5 min-w-0 flex-1 rounded-[1px] transition-colors duration-300',
                i < lit ? (quota.share >= 90 ? 'bg-destructive' : 'bg-primary') : 'bg-screen-dim',
              )}
            />
          ))}
        </span>
      </div>
      <p className="cap mt-3 text-screen-foreground/50">{note}</p>
    </section>
  );
}

/** The plan, with Upgrade or Change plan on the billing page. */
function PlanSetting({ me }: { me: MeResponse }) {
  const paid = me.plan !== FREE_PLAN;
  return (
    <Setting
      label={paid ? `${planName(me.plan)} plan, $${PLANS[me.plan].priceUsd} a month` : 'Free plan'}
      description="Only valid emails count, each address once. Every feature on every plan."
    >
      <Button asChild variant={paid ? 'secondary' : 'default'}>
        <Link href={BILLING_PATH}>
          {paid ? 'Change plan' : 'Upgrade'}
          <ArrowUpRight className="size-3.5 opacity-60" />
        </Link>
      </Button>
    </Setting>
  );
}

type ThemePreference = 'system' | 'light' | 'dark';

function readTheme(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  } catch {
    return 'system';
  }
}

function systemDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/** The finish, the same choice as the site's theme key: kept per browser, System follows the computer. */
function AppearanceSetting() {
  const [preference, setPreference] = useState<ThemePreference>('system');
  // The stored choice is only readable in the browser, after the first paint.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setPreference(readTheme()), []);
  useEffect(() => {
    if (preference !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const follow = (): void => {
      document.documentElement.classList.toggle('dark', media.matches);
    };
    media.addEventListener('change', follow);
    return () => media.removeEventListener('change', follow);
  }, [preference]);

  function choose(next: ThemePreference): void {
    setPreference(next);
    document.documentElement.classList.toggle('dark', next === 'system' ? systemDark() : next === 'dark');
    try {
      if (next === 'system') localStorage.removeItem(THEME_STORAGE_KEY);
      else localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Storage can be blocked. The choice then lasts for this page view only.
    }
  }

  return (
    <Setting label="Appearance" description="System follows your computer.">
      <Segmented<ThemePreference>
        label="Appearance"
        size="sm"
        value={preference}
        onChange={choose}
        options={[
          { value: 'system', label: 'System', icon: Monitor },
          { value: 'light', label: 'Light', icon: Sun },
          { value: 'dark', label: 'Dark', icon: Moon },
        ]}
      />
    </Setting>
  );
}

/* API keys */

function KeyRow({ apiKey, onRevoke, style }: { apiKey: ApiKey; onRevoke: () => void; style?: CSSProperties }) {
  return (
    <li className="flex items-center gap-6 py-4" data-api-key={apiKey.prefix} style={style}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[15px]" title={apiKey.name}>
            {apiKey.name}
          </span>
          {apiKey.origin === 'agent_signup' && <Badge>agent</Badge>}
        </div>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 font-mono text-[12px] tracking-[0.04em] text-muted-foreground uppercase">
          <span className="normal-case">{apiKey.prefix}…</span>
          <span>Created {relativeTime(apiKey.createdAt)}</span>
          <span>{apiKey.lastUsedAt ? `Last used ${relativeTime(apiKey.lastUsedAt)}` : 'Never used'}</span>
        </div>
      </div>
      <Button variant="ghost" size="sm" onClick={onRevoke}>
        Revoke
      </Button>
    </li>
  );
}

/** Name the key, then show it once. */
function NewKeyDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const create = useCreateApiKey();
  const [name, setName] = useState('');
  const [secret, setSecret] = useState<string | null>(null);

  function close(next: boolean): void {
    onOpenChange(next);
    if (!next) {
      // Forget the secret the moment the dialog closes.
      setTimeout(() => {
        setSecret(null);
        setName('');
        create.reset();
      }, 200);
    }
  }

  function submit(e: FormEvent): void {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    create.mutate(trimmed, {
      onSuccess: (created) => setSecret(created.key),
      onError: (err) => toast.error('Couldn’t create the key', { description: err.message }),
    });
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="top-[18vh] max-w-[min(520px,calc(100vw-32px))] p-7">
        {secret ? (
          <div className="flex flex-col gap-5">
            <div>
              <DialogTitle className="font-display text-xl font-light">{name.trim()}</DialogTitle>
              <DialogDescription className="mt-1 text-sm text-muted-foreground">Copy it now. You won’t see this key again.</DialogDescription>
            </div>
            <CopyField value={secret} what="API key" />
            <p className="text-sm text-muted-foreground">
              Send it as <code className="font-mono text-xs">Authorization: Bearer</code> to the API or the MCP server.
            </p>
            <div className="flex items-center justify-between gap-2">
              <Button asChild variant="ghost" className="-ml-3">
                <a href="/docs/api" target="_blank" rel="noreferrer">
                  How to use it
                  <ArrowUpRight className="size-3.5 opacity-60" />
                </a>
              </Button>
              <Button onClick={() => close(false)}>Done</Button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-5">
            <div>
              <DialogTitle className="font-display text-xl font-light">New API key</DialogTitle>
              <DialogDescription className="mt-1 text-sm text-muted-foreground">
                Full access to your account. Name it after what will use it.
              </DialogDescription>
            </div>
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              autoComplete="off"
              placeholder="CRM sync, Claude, a script"
              aria-label="Key name"
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => close(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!name.trim() || create.isPending}>
                {create.isPending && <Loader2 className="motion-safe:animate-spin" />}
                Create key
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function RevokeDialog({ apiKey, onOpenChange }: { apiKey: ApiKey | null; onOpenChange: (open: boolean) => void }) {
  const revoke = useRevokeApiKey();
  // Keeps the name on screen while the dialog fades out after `apiKey` clears.
  const [shown, setShown] = useState(apiKey);
  if (apiKey && apiKey !== shown) setShown(apiKey);
  return (
    <AlertDialog open={apiKey !== null} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Revoke {shown?.name}?</AlertDialogTitle>
          <AlertDialogDescription>Anything using it stops working at once. This can’t be undone.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep it</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              if (!apiKey) return;
              revoke.mutate(apiKey.id, {
                onSuccess: () => toast.success('Key revoked', { description: apiKey.name }),
                onError: (err) => toast.error('Couldn’t revoke the key', { description: err.message }),
              });
            }}
          >
            Revoke
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ApiKeys() {
  const { data: keys, error, isPending, refetch } = useApiKeys();
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState<ApiKey | null>(null);
  const arrive = useArrivals(keys?.map((k) => k.id) ?? []);

  return (
    <section data-api-keys>
      <SectionHeading
        title="API keys"
        description="For scripts and agents. A key can do everything you can."
        action={
          <div className="flex items-center gap-1">
            <Button asChild variant="ghost">
              <a href="/docs" target="_blank" rel="noreferrer">
                Docs
                <ArrowUpRight className="size-3.5 opacity-60" />
              </a>
            </Button>
            <Button variant="secondary" onClick={() => setCreating(true)}>
              <Plus />
              New key
            </Button>
          </div>
        }
      />
      <div className="mt-4">
        {isPending ? (
          <div className="flex flex-col gap-3 py-4">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-64" />
          </div>
        ) : error ? (
          <p className="py-4 text-sm text-muted-foreground">
            Couldn’t load your keys.{' '}
            <button
              type="button"
              className="rounded-sm text-foreground underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/50"
              onClick={() => void refetch()}
            >
              Try again
            </button>
          </p>
        ) : keys.length === 0 ? (
          <p className="cap border-y border-border py-4 text-muted-foreground">No keys yet</p>
        ) : (
          <ul className="stagger flex flex-col divide-y divide-border border-y border-border">
            {keys.map((k) => (
              <KeyRow key={k.id} apiKey={k} onRevoke={() => setRevoking(k)} style={arrive(k.id)} />
            ))}
          </ul>
        )}
      </div>
      <NewKeyDialog open={creating} onOpenChange={setCreating} />
      <RevokeDialog apiKey={revoking} onOpenChange={(open) => !open && setRevoking(null)} />
    </section>
  );
}

/** Where to point code and agents. */
function ConnectAgent() {
  return (
    <section>
      <SectionHeading
        title="Use nvoke from code or an agent"
        description="The REST API and the MCP server take the same key and do what this app does."
      />
      <div className="mt-6 flex flex-col gap-5">
        <div>
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4">
            <span className="cap text-muted-foreground">MCP server</span>
            <a
              href="/docs/mcp"
              target="_blank"
              rel="noreferrer"
              className="rounded-sm text-sm text-muted-foreground underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              Setup for Claude, Cursor and others
            </a>
          </div>
          <CopyField value={MCP_URL} what="MCP URL" />
        </div>
        <div>
          <div className="cap mb-2 text-muted-foreground">Claude Code</div>
          <CopyField value={`claude mcp add --transport http nvoke ${MCP_URL} --header "Authorization: Bearer <key>"`} what="command" />
        </div>
        <div>
          <Button asChild variant="ghost" className="-ml-3">
            <a href="/docs/api" target="_blank" rel="noreferrer">
              REST API reference
              <ArrowUpRight className="size-3.5 opacity-60" />
            </a>
          </Button>
        </div>
      </div>
    </section>
  );
}

/* nvoke Desktop */

const DESKTOP_POWERS = [
  'Read sites that refuse servers or need JavaScript, from your own computer',
  'Daily drops: fresh launches delivered every morning, with notifications',
  'Quick search over any app, grab companies from the screen, drop a CSV to enrich it',
  'A local copy of every result: instant, and there offline',
];

/** The premium power tools, one key from the account: a plate, the powers in hairline rows. */
export function DesktopCard({ className }: { className?: string }) {
  return (
    <section data-desktop-card className={cn('plate p-5 text-card-foreground sm:p-7', className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="cap text-muted-foreground">Power tools</span>
        <span className="cap text-muted-foreground">Windows · macOS · Linux</span>
      </div>
      <h2 className="mt-4 font-display text-2xl font-light tracking-[-0.02em]">nvoke Desktop</h2>
      <p className="mt-2 max-w-lg text-sm text-muted-foreground">
        The same account, plan and searches, in a native app. Everything here, plus:
      </p>
      <ul className="mt-5 flex flex-col border-b border-border text-sm">
        {DESKTOP_POWERS.map((power) => (
          <li key={power} className="flex items-center gap-3 border-t border-border py-2.5">
            <span className="led bg-chart-1" />
            <span>{power}</span>
          </li>
        ))}
      </ul>
      <Button asChild variant="dark" className="mt-6">
        <Link href="/download">
          <Download />
          Get nvoke Desktop
        </Link>
      </Button>
    </section>
  );
}

export function AccountScreen() {
  const { data: me, error, refetch } = useMe();
  const { signOut } = useClerk();
  usePlanSync();

  return (
    <main className={cn(APP_FRAME, 'app-view pb-24')}>
      <PageHeader
        leading={<BackLink />}
        actions={
          me && (
            <Button variant="secondary" size="sm" onClick={() => void signOut({ redirectUrl: '/' })}>
              <LogOut className="size-3.5" />
              Sign out
            </Button>
          )
        }
      />
      <div className={cn(APP_INSET, 'mx-auto flex w-full max-w-[680px] flex-col pt-10 sm:pt-14')}>
        {error ? (
          <ErrorState error={error} onRetry={() => void refetch()} />
        ) : !me ? (
          <LogoLoader label="Loading your account" />
        ) : (
          <>
            <div className="flex items-center gap-5">
              <Avatar user={me.user} className="size-14 text-base sm:size-16 sm:text-lg" />
              <div className="min-w-0">
                <h1 className="truncate font-display text-3xl font-light" title={me.user.name ?? me.user.email ?? undefined}>
                  {me.user.name ?? me.user.email ?? 'Your account'}
                </h1>
                {me.user.name && me.user.email && (
                  <div className="mt-1 truncate font-mono text-xs text-muted-foreground" title={me.user.email}>
                    {me.user.email}
                  </div>
                )}
              </div>
            </div>

            {me.account.createdBy === 'agent' && (
              <p className="mt-6 font-mono text-xs text-muted-foreground">
                {me.account.agentName ? `An agent, ${me.account.agentName},` : 'An agent'} created this account for you.
              </p>
            )}

            <div className="mt-14">
              <Usage me={me} />
            </div>

            <div className="mt-10 flex flex-col divide-y divide-border border-y border-border">
              <PlanSetting me={me} />
              <AppearanceSetting />
            </div>

            <div className="mt-16">
              <ApiKeys />
            </div>
            <div className="mt-16">
              <ConnectAgent />
            </div>
            <DesktopCard className="mt-16" />
          </>
        )}
      </div>
    </main>
  );
}
