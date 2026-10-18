'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ToolExtractEmailsResponse } from '@nvoke/shared';
import { cleanDomain, DOMAIN } from '@/lib/domain';
import { ERROR_COPY, postTool, shareInUrl } from './api';
import { ResultCta } from './result-cta';
import { StatusPill, type Tone } from './status-pill';
import { LedMeter, ResultCard, ResultScreen, ToolForm } from './tool-form';
import { useTurnstile } from './turnstile';

type Phase =
  | { kind: 'idle' }
  | { kind: 'reading'; domain: string; startedAt: number }
  | { kind: 'done'; result: ToolExtractEmailsResponse }
  | { kind: 'error'; message: string };

type Status = ToolExtractEmailsResponse['status'];

const BAD_DOMAIN = 'Enter a domain, like example.com.';

/** Progress lines by seconds elapsed. A crawl takes up to about 25 seconds. */
const PROGRESS: [number, (domain: string) => string][] = [
  [0, (d) => `Opening ${d}`],
  [3, () => 'Reading the home page and looking for contact, about and team pages'],
  [9, () => 'Reading up to eight pages, one per second, as robots.txt allows'],
  [16, () => 'Slow site. Still reading'],
  [24, () => 'Nearly done. Some sites take half a minute'],
];

export const STATUS_COPY: Record<Status, { label: string; tone: Tone; body: ReactNode }> = {
  done: { label: 'Read', tone: 'good', body: null },
  blocked: {
    label: 'Blocked by robots.txt',
    tone: 'none',
    body: (
      <>
        This site’s robots.txt keeps nvokebot out, so we did not read it. We respect that.{' '}
        <Link href="/bot" className="text-foreground underline underline-offset-4">
          How nvokebot works
        </Link>
      </>
    ),
  },
  refused: {
    label: 'Refuses servers',
    tone: 'warn',
    body: 'The site blocks requests from data centers, so our servers got turned away. nvoke Desktop reads it from your own computer, like a visit in your browser.',
  },
  js_only: {
    label: 'JavaScript only',
    tone: 'warn',
    body: 'The site is a JavaScript app with nothing in its HTML for a server to read. nvoke Desktop renders it on your machine and reads what a visitor sees.',
  },
  failed: {
    label: 'No answer',
    tone: 'bad',
    body: 'The site did not answer, or answered with errors. Check the domain, or try again later.',
  },
  opted_out: {
    label: 'Opted out',
    tone: 'none',
    body: 'This domain opted out of nvoke. We do not read it and do not show its addresses.',
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
    <div className="flex flex-col gap-8">
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
        hint="Paste a domain or any URL on the site. Takes up to 25 seconds."
        error={phase.kind === 'error' ? phase.message : null}
      >
        {turnstile.widget}
      </ToolForm>
      {phase.kind === 'reading' ? <Progress domain={phase.domain} startedAt={phase.startedAt} /> : null}
      {phase.kind === 'done' ? <ExtractResult result={phase.result} /> : null}
    </div>
  );
}

function Progress({ domain, startedAt }: { domain: string; startedAt: number }) {
  const [now, setNow] = useState(startedAt);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const seconds = Math.max(0, Math.floor((now - startedAt) / 1000));
  const line = [...PROGRESS].reverse().find(([at]) => seconds >= at)?.[1](domain) ?? '';
  return (
    <ResultCard>
      <ResultScreen subject={domain} figure={String(seconds)} unit="sec" />
      <div className="flex items-center gap-2.5">
        <span aria-hidden="true" className="led led-on motion-safe:animate-pulse" />
        <span className="cap text-foreground">Reading</span>
      </div>
      <LedMeter value={Math.min(0.95, 0.08 + seconds * 0.036)} />
      <p className="text-[16px] text-pretty">{line}…</p>
    </ResultCard>
  );
}

function ExtractResult({ result }: { result: ToolExtractEmailsResponse }) {
  const status = STATUS_COPY[result.status];
  const next = cta(result);
  const count = result.emails.length;
  const headline =
    result.status === 'done'
      ? count === 0
        ? 'No public role address'
        : `${count} ${count === 1 ? 'address' : 'addresses'}`
      : status.label;
  return (
    <>
      <ResultCard>
        <ResultScreen
          subject={result.domain}
          figure={result.status === 'done' ? String(count) : undefined}
          unit={result.status === 'done' ? (count === 1 ? 'email' : 'emails') : undefined}
        />
        <div className="flex flex-col gap-3">
          <StatusPill tone={status.tone}>{result.status === 'done' ? status.label : result.status.replace('_', ' ')}</StatusPill>
          <h2 className="text-[34px] leading-[1.05] font-light tracking-[-0.035em] sm:text-[44px]">{headline}</h2>
          {status.body ? <p className="text-[16px] text-pretty text-muted-foreground">{status.body}</p> : null}
          {result.status === 'done' && count === 0 && result.hiddenPersonal === 0 ? (
            <p className="text-[16px] text-pretty text-muted-foreground">
              We read the site and found no address on its own domain. Many companies hide behind a contact form.
            </p>
          ) : null}
        </div>
        {count > 0 ? (
          <ul className="flex flex-col divide-y border-y">
            {result.emails.map((e) => (
              <li key={e.address} className="flex flex-col gap-1 py-4 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
                <span className="font-mono text-[15px] break-all">{e.address}</span>
                {e.sourceUrl ? (
                  <a
                    href={e.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="min-w-0 truncate font-mono text-xs text-muted-foreground hover:text-foreground"
                  >
                    {e.sourceUrl.replace(/^https?:\/\//, '')}
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
        {result.hiddenPersonal > 0 ? (
          <p className="flex items-center gap-2.5 text-[15px] text-pretty">
            <span aria-hidden="true" className="led" />
            Plus {result.hiddenPersonal} {result.hiddenPersonal === 1 ? 'address' : 'addresses'} of people, hidden on the
            free tool.
          </p>
        ) : null}
        {result.cached ? (
          <p className="text-sm text-muted-foreground">From a recent read of this site. We do not crawl a site twice in a row.</p>
        ) : null}
      </ResultCard>
      <ResultCta tool="website-email-extractor" title={next.title} body={next.body} />
    </>
  );
}
