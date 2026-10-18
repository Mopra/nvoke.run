'use client';

import { useId, useState, type FormEvent } from 'react';
import { OptOutRequest } from '@nvoke/shared';
import { Button } from '@/components/ui/button';
import { apiUrl } from '@/lib/api';
import { site } from '@/lib/site';

type Kind = 'email' | 'domain';

type Phase =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'done'; target: string }
  | { kind: 'error'; message: string };

const COPY = {
    legend: 'What do you want to opt out?',
    email: 'An email address',
    domain: 'A whole domain',
    emailLabel: 'Email address',
    domainLabel: 'Domain',
    emailHint: 'We delete this address and never collect it again.',
    domainHint: 'We delete every address on this domain and its subdomains. nvokebot stops visiting.',
    submit: 'Opt out',
    sending: 'Opting out...',
    badEmail: 'Enter a full email address, like name@example.com.',
    badDomain: 'Enter a domain, like example.com, without a name or @ in front.',
    rateLimited: 'Too many requests from your network. Give it a few minutes.',
    failed: (status: number) => `That failed (${status}). Try again, or write to ${site.email.privacy}.`,
    offline: `Could not reach our server. Try again, or write to ${site.email.privacy}.`,
    doneTitle: 'Done. You are opted out.',
    doneBody: (target: string) =>
      `If nvoke held anything about ${target}, it is gone now, and we will not collect it again. Customers who had it in a search no longer see it in nvoke.`,
    again: 'Opt out something else',
} as const;

/** Turns "https://www.example.com/contact" or "@example.com" into "www.example.com". */
function cleanDomain(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
    .replace(/^@/, '')
    .replace(/[/?#].*$/, '')
    .replace(/:\d+$/, '')
    .replace(/\.$/, '');
}

const DOMAIN = /^[\p{L}\p{N}-]+(\.[\p{L}\p{N}-]+)+$/u;

/**
 * Public opt-out: an email address or a whole domain. Calls
 * `POST /v1/privacy/opt-out`, which answers the same way whether or not nvoke
 * held the data, so the confirmation is worded to reveal nothing either.
 */
export function OptOutForm({ defaultKind = 'email' }: { defaultKind?: Kind }) {
  const t = COPY;
  const id = useId();
  const [kind, setKind] = useState<Kind>(defaultKind);
  const [value, setValue] = useState('');
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const target = kind === 'email' ? value.trim().toLowerCase() : cleanDomain(value);
    const body = kind === 'email' ? { email: target } : { domain: target };
    const parsed = OptOutRequest.safeParse(body);
    if (!parsed.success || (kind === 'domain' && !DOMAIN.test(target))) {
      setPhase({ kind: 'error', message: kind === 'email' ? t.badEmail : t.badDomain });
      return;
    }

    setPhase({ kind: 'sending' });
    try {
      const res = await fetch(`${apiUrl}/v1/privacy/opt-out`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });
      if (res.ok) {
        setPhase({ kind: 'done', target });
        setValue('');
      } else if (res.status === 429) {
        setPhase({ kind: 'error', message: t.rateLimited });
      } else if (res.status === 400) {
        setPhase({ kind: 'error', message: kind === 'email' ? t.badEmail : t.badDomain });
      } else {
        setPhase({ kind: 'error', message: t.failed(res.status) });
      }
    } catch {
      setPhase({ kind: 'error', message: t.offline });
    }
  }

  const card = 'plate flex flex-col gap-5 rounded-[6px] p-5 text-card-foreground sm:p-6';

  if (phase.kind === 'done') {
    return (
      <div role="status" aria-live="polite" className={card}>
        <div className="flex flex-col gap-2">
          <p className="cap flex items-center gap-2 text-foreground">
            <span aria-hidden="true" className="led bg-chart-1" />
            Done
          </p>
          <p className="text-[21px] font-light tracking-[-0.02em]">{t.doneTitle}</p>
          <p className="text-pretty text-muted-foreground">{t.doneBody(phase.target)}</p>
        </div>
        <Button type="button" variant="secondary" className="w-fit" onClick={() => setPhase({ kind: 'idle' })}>
          {t.again}
        </Button>
      </div>
    );
  }

  const field =
    'h-10 w-full rounded-[4px] bg-background/60 px-3 font-mono text-[15px] shadow-[inset_0_1px_2px_var(--shadow-strong)] outline-none transition-shadow duration-150 placeholder:text-muted-foreground/90 focus-visible:ring-[3px] focus-visible:ring-ring/25 aria-invalid:ring-[3px] aria-invalid:ring-destructive/25';
  const option =
    'key group/opt flex h-8 flex-1 cursor-pointer items-center justify-center gap-2 bg-secondary px-3 font-mono text-[11.5px] font-medium tracking-[0.07em] text-secondary-foreground uppercase has-checked:key-down has-focus-visible:ring-[3px] has-focus-visible:ring-ring/40';

  const inputId = `${id}-value`;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const error = phase.kind === 'error' ? phase.message : null;

  return (
    <form onSubmit={submit} noValidate className={card}>
      <fieldset className="flex flex-col gap-2">
        <legend className="cap mb-2 text-muted-foreground">{t.legend}</legend>
        <div className="flex gap-2">
          {(['email', 'domain'] as const).map((k) => (
            <label key={k} className={option}>
              <input
                type="radio"
                name={`${id}-kind`}
                value={k}
                checked={kind === k}
                onChange={() => {
                  setKind(k);
                  if (phase.kind === 'error') setPhase({ kind: 'idle' });
                }}
                className="sr-only"
              />
              <span aria-hidden="true" className="led group-has-checked/opt:led-on" />
              {t[k]}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-col gap-2">
        <label htmlFor={inputId} className="cap text-muted-foreground">
          {kind === 'email' ? t.emailLabel : t.domainLabel}
        </label>
        <input
          id={inputId}
          name={kind}
          type={kind === 'email' ? 'email' : 'text'}
          required
          inputMode={kind === 'email' ? 'email' : 'url'}
          autoComplete={kind === 'email' ? 'email' : 'off'}
          autoCapitalize="none"
          spellCheck={false}
          placeholder={kind === 'email' ? 'name@example.com' : 'example.com'}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-describedby={error ? `${hintId} ${errorId}` : hintId}
          aria-invalid={error ? true : undefined}
          className={field}
        />
        <p id={hintId} className="text-sm text-muted-foreground">
          {kind === 'email' ? t.emailHint : t.domainHint}
        </p>
        {error ? (
          <p id={errorId} role="alert" className="flex items-center gap-2 text-sm text-foreground">
            <span aria-hidden="true" className="led bg-destructive" />
            {error}
          </p>
        ) : null}
      </div>
      <Button type="submit" className="w-fit" disabled={phase.kind === 'sending'}>
        {phase.kind === 'sending' ? t.sending : t.submit}
      </Button>
    </form>
  );
}
