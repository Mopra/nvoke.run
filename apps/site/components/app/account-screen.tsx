'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { useClerk } from '@clerk/nextjs';
import { ArrowUpRight, Check, Copy, Download, Loader2, LogOut, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { FREE_PLAN, PLANS, type ApiKey, type MeResponse } from '@nvoke/shared';
import { Avatar } from '@/components/app/avatar';
import { APP_COLUMN, APP_FRAME, APP_INSET, DisplayTitle } from '@/components/app/shell';
import { ErrorState } from '@/components/app/states';
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

/** A value in monospace with a copy button. Wraps instead of clipping. */
function CopyField({ value, what, className }: { value: string; what: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  async function onCopy(): Promise<void> {
    if (await copy(value, what)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    }
  }
  return (
    <div className={cn('glass flex items-start gap-2 rounded-[18px] py-2 pr-1.5 pl-4', className)}>
      <code className="min-w-0 flex-1 py-1 font-mono text-xs leading-5 break-all select-all">{value}</code>
      <Button variant="ghost" size="icon-sm" onClick={() => void onCopy()} aria-label={`Copy ${what}`}>
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </Button>
    </div>
  );
}

function SectionHeading({ title, description, action }: { title: string; description: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
      <div className="min-w-0 flex-1">
        <h2 className="font-display text-xl font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/* Plan and usage */

function UsageAndPlan({ me }: { me: MeResponse }) {
  const quota = quotaState(me);
  const { period } = me.usage;
  const paid = me.plan !== FREE_PLAN;
  return (
    <section data-usage>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-display text-5xl font-extralight tabular-nums">{formatNumber(quota.used)}</span>
        <span className="text-base text-muted-foreground">of {formatNumber(quota.limit)} verified emails</span>
      </div>
      <div
        role="meter"
        aria-label="Verified emails used this month"
        aria-valuemin={0}
        aria-valuemax={quota.limit}
        aria-valuenow={quota.used}
        className="mt-6 h-[3px] overflow-hidden rounded-full bg-foreground/[0.08]"
      >
        <div
          className={cn('h-full rounded-full transition-[width] duration-1000 ease-out-soft', quota.share >= 90 ? 'bg-destructive' : 'bg-primary')}
          style={{ width: `${quota.share}%` }}
        />
      </div>
      <p className="mt-3 text-sm text-muted-foreground">
        {quota.level === 'out'
          ? `Out of verified emails for ${periodLabel(period)}. Searches stop at the limit until ${resetDate(period)}. Or upgrade.`
          : `${formatNumber(quota.left)} left in ${periodLabel(period)}. Resets on ${resetDate(period)}.`}
      </p>
      <div className="mt-6 flex flex-wrap items-center gap-x-8 gap-y-4 border-t pt-6">
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-medium">
            {paid ? `${planName(me.plan)} plan, $${PLANS[me.plan].priceUsd} a month` : 'Free plan'}
          </div>
          <div className="mt-1 text-sm text-muted-foreground">Only valid emails count, each address once. Every feature on every plan.</div>
        </div>
        <Button asChild variant={paid ? 'outline' : 'default'}>
          <Link href={BILLING_PATH}>
            {paid ? 'Change plan' : 'Upgrade'}
            <ArrowUpRight className="size-3.5 opacity-60" />
          </Link>
        </Button>
      </div>
    </section>
  );
}

/* API keys */

function KeyRow({ apiKey, onRevoke }: { apiKey: ApiKey; onRevoke: () => void }) {
  return (
    <li className="flex items-center gap-6 py-4" data-api-key={apiKey.prefix}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[15px] font-medium">{apiKey.name}</span>
          {apiKey.origin === 'agent_signup' && <Badge>agent</Badge>}
        </div>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          <span className="font-mono">{apiKey.prefix}…</span>
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
              <DialogTitle className="font-display text-xl font-semibold">{name.trim()}</DialogTitle>
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
              <DialogTitle className="font-display text-xl font-semibold">New API key</DialogTitle>
              <DialogDescription className="mt-1 text-sm text-muted-foreground">
                Full access to your account. Name it after what will use it.
              </DialogDescription>
            </div>
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              placeholder="CRM sync, Claude, a script"
              aria-label="Key name"
              className="h-10 rounded-full px-4"
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
  return (
    <AlertDialog open={apiKey !== null} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Revoke {apiKey?.name}?</AlertDialogTitle>
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

  return (
    <section data-api-keys>
      <SectionHeading
        title="API keys"
        description="For scripts and agents. A key can do everything you can."
        action={
          <Button variant="outline" onClick={() => setCreating(true)}>
            <Plus />
            New key
          </Button>
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
            <button type="button" className="text-foreground underline-offset-4 hover:underline" onClick={() => void refetch()}>
              Try again
            </button>
          </p>
        ) : keys.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">No keys yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {keys.map((k) => (
              <KeyRow key={k.id} apiKey={k} onRevoke={() => setRevoking(k)} />
            ))}
          </ul>
        )}
      </div>
      <div className="mt-6 flex flex-col gap-4">
        <div>
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4">
            <span className="text-sm font-medium">MCP server, for Claude, Cursor and other agents</span>
            <a href="/docs/mcp" target="_blank" rel="noreferrer" className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
              Setup
            </a>
          </div>
          <CopyField value={MCP_URL} what="MCP URL" />
        </div>
        <div>
          <div className="mb-2 text-sm font-medium">Claude Code</div>
          <CopyField value={`claude mcp add --transport http nvoke ${MCP_URL} --header "Authorization: Bearer <key>"`} what="command" />
        </div>
      </div>
      <NewKeyDialog open={creating} onOpenChange={setCreating} />
      <RevokeDialog apiKey={revoking} onOpenChange={(open) => !open && setRevoking(null)} />
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

/** The premium power tools, one click from the account. */
export function DesktopCard({ className }: { className?: string }) {
  return (
    <section
      data-desktop-card
      className={cn('relative overflow-hidden rounded-[28px] bg-foreground/[0.035] p-6 sm:p-8', className)}
    >
      <div aria-hidden className="halo pointer-events-none absolute -top-24 -right-24 size-72 opacity-40" />
      <div className="relative">
        <span className="rounded-full bg-primary/12 px-2.5 py-1 text-xs font-medium text-primary">Power tools</span>
        <h2 className="mt-4 font-display text-2xl font-semibold tracking-[-0.03em]">Get nvoke Desktop</h2>
        <p className="mt-2 max-w-lg text-sm text-muted-foreground">
          The same account, plan and searches, in a native app for Windows, macOS and Linux. Everything here, plus:
        </p>
        <ul className="mt-5 flex flex-col gap-2.5 text-sm">
          {DESKTOP_POWERS.map((power) => (
            <li key={power} className="flex gap-2.5">
              <Check className="mt-0.5 size-4 shrink-0 text-primary" />
              <span>{power}</span>
            </li>
          ))}
        </ul>
        <Button asChild className="mt-7">
          <Link href="/download">
            <Download />
            Get nvoke Desktop
          </Link>
        </Button>
      </div>
    </section>
  );
}

export function AccountScreen() {
  const { data: me, error, refetch } = useMe();
  const { signOut } = useClerk();
  usePlanSync();

  return (
    <main className={cn(APP_FRAME, 'pb-24')}>
      <div className={cn(APP_INSET, APP_COLUMN, 'motion-safe:animate-rise')}>
        <DisplayTitle>Account</DisplayTitle>
        {error ? (
          <ErrorState error={error} onRetry={() => void refetch()} />
        ) : !me ? (
          <div className="flex flex-col gap-4">
            <Skeleton className="h-12 w-48" />
            <Skeleton className="h-1 w-full" />
            <Skeleton className="h-3 w-64" />
          </div>
        ) : (
          <div className="flex flex-col gap-14">
            <div className="flex items-center gap-4">
              <Avatar user={me.user} className="size-11" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15px] font-medium">{me.user.name ?? me.user.email ?? 'Signed in'}</div>
                {me.user.name && me.user.email && <div className="truncate text-sm text-muted-foreground">{me.user.email}</div>}
              </div>
              <Button variant="ghost" className="-mr-4" onClick={() => void signOut({ redirectUrl: '/' })}>
                <LogOut />
                Sign out
              </Button>
            </div>
            <UsageAndPlan me={me} />
            <DesktopCard />
            <ApiKeys />
          </div>
        )}
      </div>
    </main>
  );
}
