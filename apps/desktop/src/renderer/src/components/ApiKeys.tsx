import { useState, type FormEvent, type ReactNode } from 'react';
import { ArrowUpRight, Check, Copy, Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import type { ApiKey } from '@nvoke/shared';
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
import { api } from '@/lib/api';
import { API_DOCS_URL, DOCS_URL, MCP_DOCS_URL, MCP_URL } from '@/lib/env';
import { relativeTime } from '@/lib/format';
import { useApiKeys, useCreateApiKey, useRevokeApiKey } from '@/lib/queries';
import { cn } from '@/lib/utils';

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
export function CopyField({ value, what, className }: { value: string; what: string; className?: string }) {
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

/** Opens a docs page on the site in the system browser. */
export function DocsLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <Button variant="ghost" className={className} onClick={() => void api.openExternal(href)}>
      {children}
      <ArrowUpRight className="size-3.5 opacity-60" />
    </Button>
  );
}

export function SectionHeading({ title, description, action }: { title: string; description: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-end gap-6">
      <div className="min-w-0 flex-1">
        <h2 className="font-display text-xl font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

function KeyRow({ apiKey, onRevoke }: { apiKey: ApiKey; onRevoke: () => void }) {
  return (
    <li className="flex items-center gap-6 py-4">
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
      <DialogContent className="top-[18vh] max-w-[520px] p-7">
        {secret ? (
          <div className="flex flex-col gap-5">
            <div>
              <DialogTitle className="font-display text-xl font-semibold">{name.trim()}</DialogTitle>
              <DialogDescription className="mt-1 text-sm text-muted-foreground">
                Copy it now. You won’t see this key again.
              </DialogDescription>
            </div>
            <CopyField value={secret} what="API key" />
            <p className="text-sm text-muted-foreground">
              Send it as <code className="font-mono text-xs">Authorization: Bearer</code> to the API or the MCP server.
            </p>
            <div className="flex items-center justify-between gap-2">
              <DocsLink href={API_DOCS_URL} className="-ml-3">
                How to use it
              </DocsLink>
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
          <AlertDialogDescription>
            Anything using it stops working at once. This can’t be undone.
          </AlertDialogDescription>
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

export function ApiKeys() {
  const { data: keys, error, isPending, refetch } = useApiKeys();
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState<ApiKey | null>(null);

  return (
    <section data-api-keys>
      <SectionHeading
        title="API keys"
        description="For scripts and agents. A key can do everything you can."
        action={
          <div className="flex items-center gap-1">
            <DocsLink href={DOCS_URL}>Docs</DocsLink>
            <Button variant="outline" onClick={() => setCreating(true)}>
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
      <NewKeyDialog open={creating} onOpenChange={setCreating} />
      <RevokeDialog apiKey={revoking} onOpenChange={(open) => !open && setRevoking(null)} />
    </section>
  );
}

/** Where to point code and agents. */
export function ConnectAgent() {
  return (
    <section>
      <SectionHeading
        title="Use nvoke from code or an agent"
        description="The REST API and the MCP server take the same key and do what this app does."
        action={<DocsLink href={DOCS_URL}>Docs</DocsLink>}
      />
      <div className="mt-6 flex flex-col gap-5">
        <div>
          <div className="mb-2 flex items-baseline justify-between gap-4">
            <span className="text-sm font-medium">MCP server</span>
            <button
              type="button"
              className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              onClick={() => void api.openExternal(MCP_DOCS_URL)}
            >
              Setup for other clients
            </button>
          </div>
          <CopyField value={MCP_URL} what="MCP URL" />
        </div>
        <div>
          <div className="mb-2 text-sm font-medium">Claude Code</div>
          <CopyField
            value={`claude mcp add --transport http nvoke ${MCP_URL} --header "Authorization: Bearer <key>"`}
            what="command"
          />
        </div>
        <div>
          <DocsLink href={API_DOCS_URL} className="-ml-3">
            REST API reference
          </DocsLink>
        </div>
      </div>
    </section>
  );
}
