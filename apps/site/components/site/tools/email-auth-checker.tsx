'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { ToolEmailAuthResponse } from '@nvoke/shared';
import { cleanDomain, DOMAIN } from '@/lib/domain';
import { ERROR_COPY, postTool, shareInUrl } from './api';
import { AuthDemo, AuthDisplay, authRunning, useElapsed } from './displays';
import { ResultCta } from './result-cta';
import { StatusPill } from './status-pill';
import { Announce, ToolForm } from './tool-form';

type Phase =
  | { kind: 'idle' }
  | { kind: 'checking'; domain: string; startedAt: number }
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
    setPhase({ kind: 'checking', domain, startedAt: Date.now() });
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
    <div className="flex flex-col gap-10">
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
        hint="The domain you send from. An address works too."
        error={phase.kind === 'error' ? phase.message : null}
      />
      {phase.kind === 'checking' ? (
        <Running domain={phase.domain} startedAt={phase.startedAt} />
      ) : phase.kind === 'done' ? (
        <AuthResult result={phase.result} />
      ) : (
        <AuthDemo />
      )}
    </div>
  );
}

function Running({ domain, startedAt }: { domain: string; startedAt: number }) {
  const ms = useElapsed(startedAt, 100);
  return (
    <>
      <Announce>Reading the DNS records of {domain}.</Announce>
      <AuthDisplay view={authRunning(domain, ms)} hidden />
    </>
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
    <li className="grid gap-3 border-t py-6 sm:grid-cols-[10rem_1fr] sm:gap-8">
      <div className="flex items-start justify-between gap-3 sm:flex-col sm:justify-start">
        <h3 className="font-mono text-[15px] font-medium tracking-[0.04em]">{name}</h3>
        <StatusPill tone={GRADE[grade].tone}>{GRADE[grade].label}</StatusPill>
      </div>
      <div className="flex min-w-0 flex-col gap-3">
        <p className="text-[15px] text-muted-foreground">{what}</p>
        {record ? (
          <pre className="font-mono text-[13px] leading-relaxed whitespace-pre-wrap break-all text-foreground">{record}</pre>
        ) : null}
        {extra ? <p className="cap text-muted-foreground">{extra}</p> : null}
        {notes.length > 0 ? (
          <ul className="flex flex-col gap-1.5 text-[15px] text-pretty">
            {notes.map((n) => (
              <li key={n} className="flex gap-2.5">
                <span aria-hidden="true" className="led mt-[0.55em]" />
                {n}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </li>
  );
}

function AuthResult({ result }: { result: ToolEmailAuthResponse }) {
  const next = cta(result);
  const { mx, spf, dmarc, dkim } = result;
  const records = [
    { name: 'MX', r: mx },
    { name: 'SPF', r: spf },
    { name: 'DMARC', r: dmarc },
    { name: 'DKIM', r: dkim },
  ];
  const passed = records.filter(({ r }) => r.grade === 'pass').length;
  const worst = records.some(({ r }) => r.grade === 'fail') ? 'bad' : records.some(({ r }) => r.grade === 'warn') ? 'warn' : 'good';
  return (
    <div className="flex flex-col gap-8">
      <Announce>
        {result.domain}: {passed} of 4 pass. {records.map(({ name, r }) => `${name} ${GRADE[r.grade].label}`).join(', ')}.
      </Announce>
      <AuthDisplay
        hidden
        view={{
          lamp: worst,
          mode: 'Result',
          meta: 'Public DNS',
          subject: result.domain,
          passed,
          channels: records.map(({ name, r }) => ({ name, lamp: GRADE[r.grade].tone, word: GRADE[r.grade].label })),
        }}
      />
      <div>
        <h2 className="sr-only">{passed} of 4 pass</h2>
        <ul className="flex flex-col border-b">
          <Row
            name="MX"
            what="Where mail for the domain goes."
            grade={mx.grade}
            record={mx.hosts.length > 0 ? mx.hosts.join('\n') : null}
            notes={mx.notes}
          />
          <Row
            name="SPF"
            what="Which servers may send as the domain."
            grade={spf.grade}
            record={spf.record}
            extra={spf.record ? `${spf.lookups} of 10 DNS lookups${spf.all ? `, ends in ${spf.all}` : ''}` : null}
            notes={spf.notes}
          />
          <Row
            name="DMARC"
            what="What receivers do when SPF and DKIM fail."
            grade={dmarc.grade}
            record={dmarc.record}
            extra={dmarc.policy ? `Policy: ${dmarc.policy}` : null}
            notes={dmarc.notes}
          />
          <Row
            name="DKIM"
            what="Signatures that prove a message was not changed."
            grade={dkim.grade}
            record={dkim.selectors.length > 0 ? dkim.selectors.map((s) => `${s}._domainkey.${result.domain}`).join('\n') : null}
            notes={dkim.notes}
          />
        </ul>
      </div>
      <ResultCta tool="spf-dmarc-checker" title={next.title} body={next.body} />
    </div>
  );
}
