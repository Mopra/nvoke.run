'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { ToolEmailAuthResponse } from '@nvoke/shared';
import { cleanDomain, DOMAIN } from '@/lib/domain';
import { ERROR_COPY, postTool, shareInUrl } from './api';
import { ResultCta } from './result-cta';
import { StatusPill } from './status-pill';
import { ResultCard, ResultScreen, ToolForm } from './tool-form';

type Phase =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'done'; result: ToolEmailAuthResponse }
  | { kind: 'error'; message: string };

type Grade = ToolEmailAuthResponse['mx']['grade'];

const BAD_DOMAIN = 'Enter a domain, like example.com.';

const GRADE: Record<Grade, { label: string; tone: 'good' | 'warn' | 'bad' }> = {
  pass: { label: 'Pass', tone: 'good' },
  warn: { label: 'Warning', tone: 'warn' },
  fail: { label: 'Fail', tone: 'bad' },
};

function cta(result: ToolEmailAuthResponse): { title: string; body: string } {
  const grades = [result.mx.grade, result.spf.grade, result.dmarc.grade, result.dkim.grade];
  if (grades.includes('fail')) {
    return {
      title: 'Fix these records before you write to anyone.',
      body: 'Then fill the list: nvoke finds companies in your niche and checks every address it hands you.',
    };
  }
  if (grades.includes('warn')) {
    return {
      title: 'Close. Tighten the warnings, then find your leads.',
      body: 'nvoke finds companies, reads their websites and keeps the addresses that pass a mailbox check.',
    };
  }
  return {
    title: 'Your domain is set up right. Now find who to write to.',
    body: 'nvoke finds companies, reads their websites and keeps the addresses that pass a mailbox check.',
  };
}

/** The SPF and DMARC checker: four DNS checks, graded. */
export function EmailAuthChecker() {
  const params = useSearchParams();
  const [value, setValue] = useState(() => params.get('domain') ?? '');
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });

  async function check(raw: string) {
    const domain = cleanDomain(raw);
    if (!DOMAIN.test(domain)) {
      setPhase({ kind: 'error', message: BAD_DOMAIN });
      return;
    }
    setValue(domain);
    setPhase({ kind: 'checking' });
    const res = await postTool('/v1/tools/email-auth', { domain }, ToolEmailAuthResponse);
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
    const timer = setTimeout(() => void check(initial), 0);
    return () => clearTimeout(timer);
    // Runs once, for a shared link.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col gap-8">
      <ToolForm
        label="Domain"
        placeholder="example.com"
        type="domain"
        value={value}
        onChange={(v) => {
          setValue(v);
          if (phase.kind === 'error') setPhase({ kind: 'idle' });
        }}
        onSubmit={() => void check(value)}
        busy={phase.kind === 'checking'}
        submitLabel="Check"
        busyLabel="Reading DNS"
        hint="The domain you send email from. Paste an address and we take the part after the @."
        error={phase.kind === 'error' ? phase.message : null}
      />
      {phase.kind === 'done' ? <AuthResult result={phase.result} /> : null}
    </div>
  );
}

function Row({
  name,
  what,
  grade,
  record,
  extra,
  notes,
}: {
  name: string;
  what: string;
  grade: Grade;
  record?: ReactNode;
  extra?: ReactNode;
  notes: string[];
}) {
  return (
    <li className="flex flex-col gap-3 py-5 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col">
          <h3 className="font-mono text-[15px] font-medium tracking-[0.04em]">{name}</h3>
          <p className="text-sm text-muted-foreground">{what}</p>
        </div>
        <StatusPill tone={GRADE[grade].tone}>{GRADE[grade].label}</StatusPill>
      </div>
      {record ? (
        <pre className="screen overflow-x-auto px-4 py-3 font-mono text-[13px] leading-relaxed whitespace-pre-wrap break-all">
          {record}
        </pre>
      ) : null}
      {extra ? <p className="text-sm text-muted-foreground">{extra}</p> : null}
      {notes.length > 0 ? (
        <ul className="flex list-disc flex-col gap-1.5 pl-5 text-[15px] text-pretty text-muted-foreground marker:text-muted-foreground/50">
          {notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function AuthResult({ result }: { result: ToolEmailAuthResponse }) {
  const next = cta(result);
  const { mx, spf, dmarc, dkim } = result;
  const passed = [mx, spf, dmarc, dkim].filter((r) => r.grade === 'pass').length;
  return (
    <>
      <ResultCard>
        <ResultScreen subject={result.domain} figure={`${passed}/4`} unit="pass" />
        <h2 className="sr-only">{passed} of 4 pass</h2>
        <ul className="flex flex-col divide-y">
          <Row
            name="MX"
            what="Where mail for the domain goes"
            grade={mx.grade}
            record={mx.hosts.length > 0 ? mx.hosts.join('\n') : null}
            notes={mx.notes}
          />
          <Row
            name="SPF"
            what="Which servers may send as the domain"
            grade={spf.grade}
            record={spf.record}
            extra={spf.record ? `${spf.lookups} of 10 DNS lookups${spf.all ? `, ends in ${spf.all}` : ''}` : null}
            notes={spf.notes}
          />
          <Row
            name="DMARC"
            what="What receivers do when SPF and DKIM fail"
            grade={dmarc.grade}
            record={dmarc.record}
            extra={dmarc.policy ? `Policy: ${dmarc.policy}` : null}
            notes={dmarc.notes}
          />
          <Row
            name="DKIM"
            what="Signatures that prove a message was not changed"
            grade={dkim.grade}
            record={dkim.selectors.length > 0 ? dkim.selectors.map((s) => `${s}._domainkey.${result.domain}`).join('\n') : null}
            notes={dkim.notes}
          />
        </ul>
      </ResultCard>
      <ResultCta tool="spf-dmarc-checker" title={next.title} body={next.body} />
    </>
  );
}
