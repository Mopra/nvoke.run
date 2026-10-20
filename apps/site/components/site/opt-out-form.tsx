'use client';

import { useId, useState, type FormEvent } from 'react';
import { OptOutRequest } from '@nvoke/shared';
import { Button } from '@/components/ui/button';
import { fieldClass } from '@/components/site/tools/tool-form';
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
    sending: 'Opting out',
    badEmail: 'Enter a full email address, like name@example.com.',
    badDomain: 'Enter a domain, like example.com, without a name or @ in front.',
    rateLimited: 'Too many requests from your network. Give it a few minutes.',
    failed: (status: number) => `That failed (${status}). Try again, or write to ${site.email.privacy}.`,
    offline: `Could not reach our server. Try again, or write to ${site.email.privacy}.`,
    doneTitle: 'Opted out',
    doneBody: (target: string) =>
      `If nvoke held anything about ${target}, it is gone now and will not be collected again. Customers no longer see it in nvoke.`,
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

  if (phase.kind === 'done') {
    return (
      <div role="status" aria-live="polite" className="flex flex-col gap-6">
        <div className="screen screen-hero p-5 sm:p-8">
          <div className="flex items-center gap-3">
            <span aria-hidden="true" className="led bg-chart-1 shadow-[0_0_6px_var(--chart-1)]" />
            <span className="cap text-screen-foreground/55">Done</span>
            <span className="cap ml-auto text-screen-foreground/60">Permanent</span>
          </div>
          <p className="lcd mt-6 text-[34px] leading-none uppercase sm:mt-8 sm:text-[56px]">{t.doneTitle}</p>
          <p className="mt-4 font-mono text-[14px] break-all text-screen-foreground/70 sm:text-[15px]">{phase.target}</p>
        </div>
        <p className="text-[15px] text-pretty text-muted-foreground">{t.doneBody(phase.target)}</p>
        <Button type="button" variant="secondary" size="lg" className="w-fit" onClick={() => setPhase({ kind: 'idle' })}>
          {t.again}
        </Button>
      </div>
    );
  }

  const option =
    'key group/opt flex h-10 flex-1 cursor-pointer items-center justify-center gap-2 bg-secondary px-3 font-mono text-[11.5px] font-medium tracking-[0.07em] text-secondary-foreground uppercase has-checked:key-down has-focus-visible:ring-[3px] has-focus-visible:ring-ring/40';

  const inputId = `${id}-value`;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const error = phase.kind === 'error' ? phase.message : null;

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-8">
      <fieldset className="flex flex-col gap-2">
        <legend className="cap mb-2 text-muted-foreground">{t.legend}</legend>
        <div className="flex max-w-md gap-2">
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
          className={fieldClass}
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
      <Button type="submit" size="xl" variant="dark" className="w-full sm:w-fit" disabled={phase.kind === 'sending'}>
        {phase.kind === 'sending' ? t.sending : t.submit}
      </Button>
    </form>
  );
}
