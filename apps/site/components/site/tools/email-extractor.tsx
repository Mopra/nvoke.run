'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ToolExtractEmailsResponse } from '@nvoke/shared';
import { cleanDomain, DOMAIN } from '@/lib/domain';
import { ERROR_COPY, postTool, shareInUrl } from './api';
import { METER_SEGMENTS } from '@/components/mockups/parts';
import { ExtractDemo, ExtractDisplay, extractRunning, useElapsed } from './displays';
import { ResultCta } from './result-cta';
import type { Tone } from './status-pill';
import { Announce, ToolForm } from './tool-form';
import { useTurnstile } from './turnstile';

type Phase =
  | { kind: 'idle' }
  | { kind: 'reading'; domain: string; startedAt: number }
  | { kind: 'done'; result: ToolExtractEmailsResponse }
  | { kind: 'error'; message: string };

type Status = ToolExtractEmailsResponse['status'];

const BAD_DOMAIN = 'Enter a domain, like example.com.';

export const STATUS_COPY: Record<Status, { label: string; tone: Tone; body: ReactNode }> = {
  done: { label: 'Read', tone: 'good', body: null },
  blocked: {
    label: 'Blocked by robots.txt',
    tone: 'none',
    body: (
      <>
        Its robots.txt keeps nvokebot out, so we did not read it.{' '}
        <Link href="/bot" className="text-foreground underline underline-offset-4">
          How nvokebot works
        </Link>
      </>
    ),
  },
  refused: {
    label: 'Refuses servers',
    tone: 'warn',
    body: 'The site turns away data centers. nvoke Desktop reads it from your own computer.',
  },
  js_only: {
    label: 'JavaScript only',
    tone: 'warn',
    body: 'A JavaScript app with an empty HTML shell. nvoke Desktop renders it on your machine and reads it.',
  },
  failed: {
    label: 'No answer',
    tone: 'bad',
    body: 'The site did not answer. Check the domain, or try again later.',
  },
  opted_out: {
    label: 'Opted out',
    tone: 'none',
    body: 'This domain opted out of nvoke. We do not read it.',
  },
};

function cta(result: ToolExtractEmailsResponse): { title: string; body: string } {
  if (result.hiddenPersonal > 0) {
    const n = result.hiddenPersonal;
    return {
      title: `${n} ${n === 1 ? 'address' : 'addresses'} of people found. Sign up to see them, verified.`,
      body: 'Every address nvoke finds is checked with its mail server. You pay only for the ones that work.',
    };
  }
  if (result.status === 'refused' || result.status === 'js_only') {
    return {
      title: 'nvoke Desktop reads the sites servers can’t.',
      body: 'Sign up free, then let nvoke Desktop read this site from your own computer.',
    };
  }
  if (result.status === 'done' && result.emails.length > 0) {
    return {
      title: 'Now do it for a hundred companies at once.',
      body: 'Paste your own site. nvoke works out who buys from you, finds them, reads each website and checks every address.',
    };
  }
  return {
    title: 'One site came up empty. nvoke reads hundreds.',
    body: 'Paste your own site. nvoke finds the companies that buy from you and keeps the ones that publish an address that works.',
  };
}

/** The website email extractor: reads one site, shows its role addresses. */
export function EmailExtractor() {
  const params = useSearchParams();
  const [value, setValue] = useState(() => params.get('domain') ?? '');
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const turnstile = useTurnstile();

  async function extract(raw: string) {
    const domain = cleanDomain(raw);
    if (!DOMAIN.test(domain)) {
      setPhase({ kind: 'error', message: BAD_DOMAIN });
      return;
    }
    setValue(domain);
    setPhase({ kind: 'reading', domain, startedAt: Date.now() });
    const turnstileToken = await turnstile.getToken();
    const res = await postTool('/v1/tools/extract-emails', { domain, turnstileToken }, ToolExtractEmailsResponse, 60_000);
    turnstile.reset();
    if (res.ok) {
      setPhase({ kind: 'done', result: res.data });
      shareInUrl('domain', domain);
    } else {
      setPhase({ kind: 'error', message: res.error === 'invalid' ? BAD_DOMAIN : ERROR_COPY[res.error] });
    }
  }

  useEffect(() => {
    const initial = params.get('domain');
    if (!initial) return;
    // A timer, so Strict Mode's double effect cancels the first run.
    const timer = setTimeout(() => void extract(initial), 0);
    return () => clearTimeout(timer);
    // Runs once, for a shared link.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col gap-10">
      <ToolForm
        label="Website domain"
        placeholder="example.com"
        type="domain"
        value={value}
        onChange={(v) => {
          setValue(v);
          if (phase.kind === 'error') setPhase({ kind: 'idle' });
        }}
        onSubmit={() => void extract(value)}
        busy={phase.kind === 'reading'}
        submitLabel="Find emails"
        busyLabel="Reading"
        hint="A domain or any URL on the site. Up to 25 seconds."
        error={phase.kind === 'error' ? phase.message : null}
      >
        {turnstile.widget}
      </ToolForm>
      {phase.kind === 'reading' ? (
        <Progress domain={phase.domain} startedAt={phase.startedAt} />
      ) : phase.kind === 'done' ? (
        <ExtractResult result={phase.result} />
      ) : (
        <ExtractDemo />
      )}
    </div>
  );
}

function Progress({ domain, startedAt }: { domain: string; startedAt: number }) {
  const ms = useElapsed(startedAt, 250);
  return (
    <>
      <Announce>Reading {domain}. This takes up to 25 seconds.</Announce>
      <ExtractDisplay view={extractRunning(domain, ms)} hidden />
    </>
  );
}

function ExtractResult({ result }: { result: ToolExtractEmailsResponse }) {
  const status = STATUS_COPY[result.status];
  const next = cta(result);
  const count = result.emails.length;
  const read = result.status === 'done';
  const line = read
    ? count === 0
      ? 'No public role address'
      : `${count} ${count === 1 ? 'address' : 'addresses'} on the site`
    : status.label;
  return (
    <div className="flex flex-col gap-8">
      <Announce>
        {result.domain}: {line}.
        {result.hiddenPersonal > 0 ? ` Plus ${result.hiddenPersonal} addresses of people, hidden on the free tool.` : ''}
      </Announce>
      <ExtractDisplay
        view={{
          lamp: read ? (count > 0 ? 'good' : 'none') : status.tone,
          mode: 'Result',
          meta: result.cached ? 'Recent read' : read ? 'Read now' : undefined,
          subject: result.domain,
          line,
          lit: read ? METER_SEGMENTS : 0,
          emails: count,
          people: result.hiddenPersonal,
          list: result.emails,
          links: true,
        }}
      />
      {status.body || (read && count === 0 && result.hiddenPersonal === 0) || result.cached ? (
        <div className="flex flex-col gap-3 text-[15px] text-pretty text-muted-foreground">
          {status.body ? <p className="text-lede text-foreground">{status.body}</p> : null}
          {read && count === 0 && result.hiddenPersonal === 0 ? (
            <p className="text-lede text-foreground">Nothing on its own domain. Many companies hide behind a contact form.</p>
          ) : null}
          {result.cached ? <p>From a recent read. We do not crawl a site twice in a row.</p> : null}
        </div>
      ) : null}
      <ResultCta tool="website-email-extractor" title={next.title} body={next.body} />
    </div>
  );
}
