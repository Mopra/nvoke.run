'use client';

import { useId, useState, type FormEvent } from 'react';
import { OptOutRequest } from '@nvoke/shared';
import { Button } from '@/components/ui/button';
import { apiUrl } from '@/lib/api';
import { site } from '@/lib/site';

type Kind = 'email' | 'domain';
type Lang = 'en' | 'da';

type Phase =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'done'; target: string }
  | { kind: 'error'; message: string };

const COPY = {
  en: {
    legend: 'What do you want to opt out?',
    email: 'An email address',
    domain: 'A whole domain',
    emailLabel: 'Email address',
    domainLabel: 'Domain',
    emailHint: 'We delete this address and never collect it again.',
    domainHint: 'We delete every address on this domain and its subdomains, and nvokebot stops visiting the site.',
    submit: 'Opt out',
    sending: 'Opting out...',
    badEmail: 'Enter a full email address, like name@example.com.',
    badDomain: 'Enter a domain, like example.com, without a name or @ in front.',
    rateLimited: 'Too many requests from your network. Wait a few minutes and try again.',
    failed: (status: number) => `The request did not go through (${status}). Try again, or write to ${site.email.privacy}.`,
    offline: `We could not reach our server. Try again, or write to ${site.email.privacy}.`,
    doneTitle: 'Your opt-out is recorded',
    doneBody: (target: string) =>
      `If nvoke held anything about ${target}, it is deleted now, and we will not collect it again. Customers who already received it in a search no longer see it in nvoke.`,
    again: 'Opt out something else',
  },
  da: {
    legend: 'Hvad vil du fravælge?',
    email: 'En e-mailadresse',
    domain: 'Et helt domæne',
    emailLabel: 'E-mailadresse',
    domainLabel: 'Domæne',
    emailHint: 'Vi sletter adressen og indsamler den aldrig igen.',
    domainHint: 'Vi sletter alle adresser på domænet og dets underdomæner, og nvokebot holder op med at besøge sitet.',
    submit: 'Fravælg',
    sending: 'Fravælger...',
    badEmail: 'Skriv en hel e-mailadresse, fx navn@eksempel.dk.',
    badDomain: 'Skriv et domæne, fx eksempel.dk, uden navn eller @ foran.',
    rateLimited: 'For mange forespørgsler fra dit netværk. Vent et par minutter, og prøv igen.',
    failed: (status: number) =>
      `Forespørgslen gik ikke igennem (${status}). Prøv igen, eller skriv til ${site.email.privacy}.`,
    offline: `Vi kunne ikke nå vores server. Prøv igen, eller skriv til ${site.email.privacy}.`,
    doneTitle: 'Dit fravalg er registreret',
    doneBody: (target: string) =>
      `Hvis nvoke havde oplysninger om ${target}, er de slettet nu, og vi indsamler dem ikke igen. Kunder, der allerede har fået dem i en søgning, kan ikke længere se dem i nvoke.`,
    again: 'Fravælg noget andet',
  },
} as const;

/** Turns "https://www.example.dk/kontakt" or "@example.dk" into "www.example.dk". */
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
export function OptOutForm({ lang = 'en', defaultKind = 'email' }: { lang?: Lang; defaultKind?: Kind }) {
  const t = COPY[lang];
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

  const card = 'flex flex-col gap-5 rounded-2xl border bg-card p-6 text-card-foreground shadow-sm dark:bg-card/80';

  if (phase.kind === 'done') {
    return (
      <div role="status" aria-live="polite" className={card}>
        <div className="flex flex-col gap-2">
          <p className="text-lg font-semibold tracking-[-0.015em]">{t.doneTitle}</p>
          <p className="text-pretty text-muted-foreground">{t.doneBody(phase.target)}</p>
        </div>
        <Button type="button" variant="secondary" className="w-fit" onClick={() => setPhase({ kind: 'idle' })}>
          {t.again}
        </Button>
      </div>
    );
  }

  const field =
    'w-full rounded-[10px] bg-foreground/[0.05] px-3 py-2.5 font-mono text-sm outline-none transition-[background-color,box-shadow] duration-150 placeholder:text-muted-foreground/70 hover:bg-foreground/[0.07] focus-visible:bg-card focus-visible:shadow-sm focus-visible:ring-[3px] focus-visible:ring-ring/25 aria-invalid:ring-[3px] aria-invalid:ring-destructive/25 dark:focus-visible:bg-foreground/10';
  const option =
    'flex flex-1 cursor-pointer items-center justify-center rounded-[8px] px-3 py-1.5 text-sm text-muted-foreground transition-colors has-checked:bg-card has-checked:text-foreground has-checked:shadow-sm has-focus-visible:ring-[3px] has-focus-visible:ring-ring/40 dark:has-checked:bg-foreground/10';

  const inputId = `${id}-value`;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const error = phase.kind === 'error' ? phase.message : null;

  return (
    <form onSubmit={submit} noValidate className={card}>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">{t.legend}</legend>
        <div className="flex gap-1 rounded-[10px] bg-foreground/[0.05] p-1">
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
              {t[k]}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-col gap-2">
        <label htmlFor={inputId} className="text-sm font-medium">
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
          placeholder={kind === 'email' ? (lang === 'da' ? 'navn@eksempel.dk' : 'name@example.com') : lang === 'da' ? 'eksempel.dk' : 'example.com'}
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
          <p id={errorId} role="alert" className="text-sm text-destructive">
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
