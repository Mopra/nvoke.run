'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ToolVerifyEmailResponse, type Verification } from '@nvoke/shared';
import { ERROR_COPY, postTool, shareInUrl } from './api';
import { useElapsed, VerifyDemo, VerifyDisplay, verifyRunning, type Step, type VerifyView } from './displays';
import { ResultCta } from './result-cta';
import type { Tone } from './status-pill';
import { Announce, ToolForm } from './tool-form';
import { useTurnstile } from './turnstile';

type Phase =
  | { kind: 'idle' }
  | { kind: 'checking'; email: string; startedAt: number }
  | { kind: 'done'; result: ToolVerifyEmailResponse }
  | { kind: 'error'; message: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BAD_EMAIL = 'Enter a full email address, like name@example.com.';

export const VERDICT: Record<Verification, { label: string; tone: Tone }> = {
  valid: { label: 'Deliverable', tone: 'good' },
  invalid: { label: 'Does not exist', tone: 'bad' },
  risky: { label: 'Risky', tone: 'warn' },
  catch_all: { label: 'Accepts everything', tone: 'info' },
  unknown: { label: 'Could not confirm', tone: 'none' },
};

const REASONS: Record<string, string> = {
  syntax: 'This is not a valid email address.',
  typo_domain: 'The domain looks like a typo of a big mail provider.',
  disposable: 'A throwaway address from a disposable email service.',
  no_mx: 'The domain has no mail server. Nothing can be delivered there.',
  null_mx: 'The domain says outright that it takes no email.',
  parked_domain: 'The domain is parked. Nobody reads mail there.',
  dns_error: 'DNS did not answer for this domain. Try again later.',
  mx_only: 'The domain has a working mail server. The mailbox itself was not asked about.',
  mx_only_port25_blocked: 'The domain has a mail server, but we could not reach it to ask about the mailbox.',
  smtp_paced: 'We already asked this mail server a lot today, so we held back on the mailbox question.',
  rcpt_accepted: 'The mail server confirmed this mailbox exists.',
  accepts_any_recipient: 'The mail server says yes to any address on this domain, real or made up.',
  domain_catch_all: 'The mail server says yes to any address on this domain, real or made up.',
  mailbox_full: 'The mailbox exists but is full. Mail bounces until someone clears it.',
  smtp_unreachable: 'The mail server did not answer. It may be down or block unknown senders.',
};

const STAGES: Record<string, string> = {
  connect: 'connecting',
  banner: 'the greeting',
  ehlo: 'the greeting',
  helo: 'the greeting',
  starttls: 'the encryption handshake',
  tls: 'the encryption handshake',
  mail: 'the sender step',
  rcpt: 'the mailbox question',
};

/** Plain words for a machine reason like `rcpt_rejected_550`. */
export function reasonText(reason: string): string {
  const known = REASONS[reason];
  if (known) return known;
  let m = /^rcpt_rejected_(\d{3})$/.exec(reason);
  if (m) return `The mail server rejected this mailbox (code ${m[1]}). It does not exist, or it is closed.`;
  m = /^rcpt_tempfail_(\d{3})$/.exec(reason);
  if (m) return `The mail server answered "try later" (code ${m[1]}). It may work, it may bounce.`;
  m = /^smtp_policy_(\d{3})$/.exec(reason);
  if (m) return `The mail server refused to answer for policy reasons (code ${m[1]}), often an anti spam block.`;
  m = /^smtp_([a-z]+)_(error|\d{3})$/.exec(reason);
  if (m) {
    const stage = STAGES[m[1] ?? ''] ?? 'the conversation';
    const code = m[2] === 'error' ? '' : ` (code ${m[2]})`;
    return `The mail server broke off during ${stage}${code}, so the mailbox could not be confirmed.`;
  }
  return 'The check ended without a clear answer from the mail server.';
}

function cta(result: ToolVerifyEmailResponse): { title: string; body: string } {
  if (result.depth === 'domain') {
    return {
      title: 'Get the full mailbox check.',
      body: 'Free checks only reach the domain today. With an account, nvoke asks the mail server about every address.',
    };
  }
  switch (result.verification) {
    case 'valid':
      return {
        title: 'This one works. nvoke finds hundreds like it.',
        body: 'Paste your own site. nvoke finds who buys from you, reads each company’s website and keeps the addresses that pass this check.',
      };
    case 'invalid':
      return {
        title: 'This address would bounce. Stop guessing.',
        body: 'nvoke takes emails from the company’s own website and checks every one before you see it.',
      };
    default:
      return {
        title: 'Need a sure answer? Get more than one address.',
        body: 'nvoke collects every address a company publishes, checks each one and tells you which to trust.',
      };
  }
}

/** Which of the three checks passed, read from the reason the server gave. */
const FIRST_STEP_FAIL = new Set(['syntax', 'typo_domain', 'disposable']);
const DNS_FAIL = new Set(['no_mx', 'null_mx', 'parked_domain', 'dns_error']);
const MAILBOX_SKIPPED = new Set(['mx_only', 'mx_only_port25_blocked', 'smtp_paced']);

const MAILBOX_WORD: Record<Verification, string> = {
  valid: 'Exists',
  invalid: 'Rejected',
  risky: 'Unclear',
  catch_all: 'Says yes',
  unknown: 'No answer',
};

function resultView(result: ToolVerifyEmailResponse): VerifyView {
  const verdict = VERDICT[result.verification];
  const pass: Step = { lamp: 'good', word: 'Pass' };
  const fail: Step = { lamp: 'bad', word: 'Fail' };
  const skipped: Step = { lamp: 'off', word: 'Skipped' };
  let steps: [Step, Step, Step];
  if (FIRST_STEP_FAIL.has(result.reason)) steps = [fail, skipped, skipped];
  else if (DNS_FAIL.has(result.reason))
    steps = [pass, result.reason === 'dns_error' ? { lamp: 'warn', word: 'No answer' } : fail, skipped];
  else if (result.depth === 'domain' || MAILBOX_SKIPPED.has(result.reason)) steps = [pass, pass, skipped];
  else steps = [pass, pass, { lamp: verdict.tone, word: MAILBOX_WORD[result.verification] }];
  return {
    lamp: verdict.tone,
    mode: 'Result',
    meta: result.mxHost ?? 'No mail server',
    subject: result.email,
    steps,
    verdict: verdict.label,
  };
}

/** The email verifier: one address, asked of its mail server. */
export function EmailVerifier() {
  const params = useSearchParams();
  const [value, setValue] = useState(() => params.get('email') ?? '');
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const turnstile = useTurnstile();

  async function check(raw: string) {
    const email = raw.trim().toLowerCase();
    if (!EMAIL.test(email)) {
      setPhase({ kind: 'error', message: BAD_EMAIL });
      return;
    }
    setPhase({ kind: 'checking', email, startedAt: Date.now() });
    const turnstileToken = await turnstile.getToken();
    const res = await postTool('/v1/tools/verify-email', { email, turnstileToken }, ToolVerifyEmailResponse, 30_000);
    turnstile.reset();
    if (res.ok) {
      setPhase({ kind: 'done', result: res.data });
      shareInUrl('email', email);
    } else {
      setPhase({ kind: 'error', message: res.error === 'invalid' ? BAD_EMAIL : ERROR_COPY[res.error] });
    }
  }

  useEffect(() => {
    const initial = params.get('email');
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
        label="Email address"
        placeholder="name@company.com"
        type="email"
        value={value}
        onChange={(v) => {
          setValue(v);
          if (phase.kind === 'error') setPhase({ kind: 'idle' });
        }}
        onSubmit={() => void check(value)}
        busy={phase.kind === 'checking'}
        submitLabel="Verify"
        busyLabel="Asking"
        hint="We ask the mail server and hang up before anything is sent."
        error={phase.kind === 'error' ? phase.message : null}
      >
        {turnstile.widget}
      </ToolForm>
      {phase.kind === 'checking' ? (
        <Running email={phase.email} startedAt={phase.startedAt} />
      ) : phase.kind === 'done' ? (
        <VerifyResult result={phase.result} />
      ) : (
        <VerifyDemo />
      )}
    </div>
  );
}

function Running({ email, startedAt }: { email: string; startedAt: number }) {
  const ms = useElapsed(startedAt, 100);
  return (
    <>
      <Announce>Asking the mail server about {email}.</Announce>
      <VerifyDisplay view={verifyRunning(email, ms)} hidden />
    </>
  );
}

function VerifyResult({ result }: { result: ToolVerifyEmailResponse }) {
  const verdict = VERDICT[result.verification];
  const next = cta(result);
  const reason = reasonText(result.reason);
  return (
    <div className="flex flex-col gap-8">
      <Announce>
        {result.email}: {verdict.label}. {reason}
      </Announce>
      <VerifyDisplay view={resultView(result)} hidden />
      <div className="flex flex-col gap-3">
        <p className="text-lede text-pretty">{reason}</p>
        {result.depth === 'domain' ? (
          <p className="flex items-center gap-2.5 text-[15px] text-pretty text-muted-foreground">
            <span aria-hidden="true" className="led bg-chart-2" />
            Domain checked, mailbox not. Sign up for the full check.
          </p>
        ) : null}
      </div>
      <ResultCta tool="email-verifier" title={next.title} body={next.body} />
    </div>
  );
}
