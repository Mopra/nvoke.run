'use client';

import type { ComponentProps, ReactNode } from 'react';
import Link from 'next/link';
import { Mail, Send } from 'lucide-react';
import type { CampaignStatus, MailboxStatus } from '@nvoke/shared';
import { PLATE } from '@/components/app/search-fields';
import { APP_INSET, KeyGroup } from '@/components/app/shell';
import { Button } from '@/components/ui/button';
import { campaignLight, CAMPAIGNS_PATH, isSendingUnavailable, MAILBOXES_PATH, REPLIES_PATH } from '@/lib/app/sending';
import { useSendingSummary } from '@/lib/app/queries';
import { cn } from '@/lib/utils';

/**
 * The small parts the sending screens share: the LEDs, the plate fields,
 * the row of screen keys (Campaigns, Mailboxes, Replies) and the notice
 * when the server cannot send.
 */

/** A campaign's LED: orange and blinking while written or sent, orange when it waits for Start, green when scheduled, dark otherwise. */
export function CampaignLed({ status, screen = false, className }: { status: CampaignStatus; screen?: boolean; className?: string }) {
  const light = campaignLight(status);
  return (
    <span
      aria-hidden
      className={cn(
        'led',
        light === 'busy'
          ? 'led-on motion-safe:animate-blink'
          : light === 'ready'
            ? 'led-on'
            : light === 'waiting'
              ? 'bg-chart-1 shadow-[0_0_6px_var(--chart-1)]'
              : screen
                ? 'bg-screen-dim'
                : 'bg-muted-foreground/35',
        className,
      )}
    />
  );
}

/** A mailbox's LED: green when it can send, blinking while checked, red when it needs the user. */
export function MailboxLed({ status, className }: { status: MailboxStatus; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'led',
        status === 'active'
          ? 'bg-chart-1 shadow-[0_0_6px_var(--chart-1)]'
          : status === 'checking'
            ? 'led-on motion-safe:animate-blink'
            : status === 'paused'
              ? 'bg-muted-foreground/35'
              : 'bg-destructive',
        className,
      )}
    />
  );
}

const FIELD =
  'block w-full min-w-0 px-2.5 py-1.5 text-xs outline-none transition-[box-shadow] duration-150 placeholder:text-muted-foreground/90 focus-visible:ring-[3px] focus-visible:ring-ring/25 aria-invalid:ring-[3px] aria-invalid:ring-destructive/25 disabled:opacity-50';

/** A field on a recessed plate, small mono, as on the site profile. */
export function PlateInput({ className, ...props }: ComponentProps<'input'>) {
  return (
    <input
      autoComplete="off"
      spellCheck={false}
      {...props}
      className={cn(PLATE, FIELD, 'h-8 py-0 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none', className)}
    />
  );
}

export function PlateTextarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea {...props} className={cn(PLATE, FIELD, 'resize-y leading-relaxed', className)} />;
}

/** A labelled row in a two column form: the cap label (and a hint) left, the field right. */
export function FieldRow({ label, hint, htmlFor, children }: { label: string; hint?: ReactNode; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="contents">
      <label htmlFor={htmlFor} className="cap pt-2 text-muted-foreground">
        {label}
        {hint && <span className="mt-0.5 block font-sans text-xs tracking-normal normal-case text-muted-foreground/80">{hint}</span>}
      </label>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** A toggle keycap with its LED, like the drop's source keys. */
export function ToggleKey({ on, onClick, children, className, ...props }: ComponentProps<'button'> & { on: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      {...props}
      className={cn(
        'key inline-flex h-8 items-center gap-2 bg-secondary px-3 font-mono text-xs tracking-[0.06em] uppercase outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-45',
        on ? 'key-down text-secondary-foreground' : 'text-muted-foreground hover:text-secondary-foreground',
        className,
      )}
    >
      <span className={cn('led', on && 'led-on')} aria-hidden />
      {children}
    </button>
  );
}

/** The sending screens' keys, under one bracket: campaigns, mailboxes, replies. The open one is pressed. */
export function SendingKeys({ current, children }: { current: 'campaigns' | 'mailboxes' | 'replies'; children?: ReactNode }) {
  const { data } = useSendingSummary();
  const unread = data?.repliesUnread ?? 0;
  const keys = [
    { key: 'campaigns', href: CAMPAIGNS_PATH, label: 'Campaigns', icon: Send },
    { key: 'mailboxes', href: MAILBOXES_PATH, label: 'Mailboxes', icon: Mail },
  ] as const;
  return (
    <KeyGroup label="Sending">
      {keys
        .filter((k) => k.key !== current)
        .map((k) => (
          <Button key={k.key} asChild variant="secondary">
            <Link href={k.href}>
              <k.icon />
              {k.label}
            </Link>
          </Button>
        ))}
      {current !== 'replies' && (
        <Button asChild variant="secondary">
          <Link href={REPLIES_PATH}>
            <span aria-hidden className={cn('led', unread > 0 && 'led-on')} />
            Replies{unread > 0 && ` ${unread}`}
          </Link>
        </Button>
      )}
      {children}
    </KeyGroup>
  );
}

/** Said once on every sending screen when the server has no SECRETS_KEY or sending is switched off. */
export function SendingNotice({ className }: { className?: string }) {
  const { data, error } = useSendingSummary();
  const off = data ? !data.available : isSendingUnavailable(error);
  if (!off) return null;
  return (
    <div role="status" className={cn(APP_INSET, 'flex items-center gap-3 border-y border-border py-2.5 text-sm', className)}>
      <span aria-hidden className="led bg-chart-2" />
      Sending is switched off on this server for now. Nothing goes out until it is on.
    </div>
  );
}
