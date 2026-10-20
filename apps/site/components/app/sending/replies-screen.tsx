'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Inbox, Loader2 } from 'lucide-react';
import type { Reply } from '@nvoke/shared';
import { SendingKeys, SendingNotice } from '@/components/app/sending/parts';
import { APP_FRAME, APP_INSET } from '@/components/app/shell';
import { EmptyState, ErrorState } from '@/components/app/states';
import { RevealHeading } from '@/components/site/home/reveal';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { relativeTime } from '@/lib/app/desktop';
import { campaignPath, replySnippet, sendingError } from '@/lib/app/sending';
import { useMarkReplyRead, useReplies } from '@/lib/app/queries';
import { cn } from '@/lib/utils';

/*
 * The replies inbox: every reply across campaigns, newest first, an orange
 * LED on the unread ones. A row opens to the whole reply and marks it read;
 * from there the lead's page has the thread.
 */
function ReplyRow({ reply, open, onToggle }: { reply: Reply; open: boolean; onToggle: () => void }) {
  const unread = !reply.readAt;
  const who = reply.leadName || reply.fromAddress;
  const where = [reply.companyName, reply.campaignName].filter(Boolean).join(' · ');
  return (
    <li className={cn('border-t border-border last:border-b', open && 'bg-foreground/[0.02]')}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={cn(
          APP_INSET,
          'grid w-full grid-cols-[12px_minmax(0,1fr)_auto] items-start gap-x-4 py-4 text-left outline-none transition-colors hover:bg-foreground/[0.035] focus-visible:bg-foreground/[0.05]',
        )}
      >
        <span aria-hidden className={cn('led mt-2', unread ? 'led-on' : 'bg-transparent')} />
        <div className="min-w-0">
          <div className="flex min-w-0 items-baseline gap-3">
            <span className={cn('truncate font-display text-base', unread && 'font-medium')}>{who}</span>
            {where && <span className="cap hidden truncate text-muted-foreground sm:inline">{where}</span>}
          </div>
          <div className="mt-0.5 truncate text-sm">{reply.subject}</div>
          {!open && <div className="mt-0.5 truncate text-sm text-muted-foreground">{replySnippet(reply.bodyText)}</div>}
        </div>
        <span className="cap shrink-0 pt-1 text-muted-foreground">{relativeTime(reply.at)}</span>
      </button>
      {open && (
        <div className={cn(APP_INSET, 'grid grid-cols-[12px_minmax(0,1fr)] gap-x-4 pb-6')}>
          <div className="col-start-2 flex max-w-2xl flex-col gap-4">
            <p className="font-mono text-[12px] text-muted-foreground">
              From {reply.fromAddress} to {reply.toAddress}
            </p>
            <p className="text-sm whitespace-pre-line">{reply.bodyText || 'No text in this reply.'}</p>
            {reply.campaignId && (
              <Button asChild variant="secondary" size="sm" className="self-start">
                <Link href={campaignPath(reply.campaignId, reply.campaignLeadId ?? undefined)}>
                  Open the lead and thread
                  <ArrowUpRight className="size-3.5 opacity-70" />
                </Link>
              </Button>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

export function RepliesScreen() {
  const { data, error, isPending, refetch, hasNextPage, fetchNextPage, isFetchingNextPage } = useReplies();
  const markRead = useMarkReplyRead();
  const [open, setOpen] = useState<string | null>(null);
  const replies = data?.pages.flatMap((p) => p.replies) ?? [];
  const unread = replies.filter((r) => !r.readAt).length;

  function toggle(reply: Reply): void {
    setOpen((o) => (o === reply.id ? null : reply.id));
    if (!reply.readAt) markRead.mutate(reply.id);
  }

  return (
    <main className={cn(APP_FRAME, 'app-view pb-24')}>
      <div className={cn(APP_INSET, 'flex flex-wrap items-end justify-between gap-x-6 gap-y-4 pt-8 pb-5')}>
        <div className="flex items-start gap-3">
          <RevealHeading as="h1" lines={['Replies']} className="font-display text-3xl font-light tracking-[-0.02em] sm:text-4xl" />
          {replies.length > 0 && (
            <span className="cap pt-1 text-muted-foreground">
              {replies.length}
              {unread > 0 && <span className="text-primary"> / {unread} unread</span>}
            </span>
          )}
        </div>
        <SendingKeys current="replies" />
      </div>
      <SendingNotice className="mb-6" />
      {isPending ? (
        <div className="flex flex-col">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className={cn('flex flex-col gap-2 border-t border-border py-5 last:border-b', APP_INSET)}>
              <Skeleton className="h-4 w-48 max-w-full" />
              <Skeleton className="h-3 w-96 max-w-full" />
            </div>
          ))}
        </div>
      ) : error ? (
        <ErrorState error={new Error(sendingError(error))} onRetry={() => void refetch()} />
      ) : replies.length === 0 ? (
        <EmptyState icon={Inbox} title="No replies yet">
          Replies to your campaigns land here within a few minutes. A reply stops that lead’s follow ups; out of office answers only push them back.
        </EmptyState>
      ) : (
        <>
          <ul className="flex flex-col">
            {replies.map((r) => (
              <ReplyRow key={r.id} reply={r} open={open === r.id} onToggle={() => toggle(r)} />
            ))}
          </ul>
          {hasNextPage && (
            <div className={cn(APP_INSET, 'pt-6')}>
              <Button variant="secondary" size="sm" onClick={() => void fetchNextPage()} disabled={isFetchingNextPage}>
                {isFetchingNextPage && <Loader2 className="motion-safe:animate-spin" />}
                Older replies
              </Button>
            </div>
          )}
        </>
      )}
    </main>
  );
}
