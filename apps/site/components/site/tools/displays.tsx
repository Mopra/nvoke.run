'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Figure, METER_SEGMENTS, Readout, ScreenMeter } from '@/components/mockups/parts';
import { useInView, useTicker } from '@/components/site/home/motion';
import { cn } from '@/lib/utils';
import { Channel, ToolScreen, type Lamp } from './screen';

/*
 * What each tool shows on its screen. One readout per tool, fed three ways:
 * a sample that runs while the page waits (and on the tools index), the
 * running state while a check is out, and the real result.
 */

/** Milliseconds since `startedAt`, ticking while mounted. */
export function useElapsed(startedAt: number, every = 200) {
  const [now, setNow] = useState(startedAt);
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), every);
    return () => window.clearInterval(id);
  }, [every]);
  return Math.max(0, now - startedAt);
}

const NBSP = String.fromCharCode(160);

function Caret() {
  return (
    <span className="ml-px inline-block h-[0.9em] w-[0.5em] translate-y-[0.1em] bg-screen-foreground/80 motion-safe:animate-blink" />
  );
}

/* verifier */

export type Step = { lamp: Lamp; word: string };

export type VerifyView = {
  lamp: Lamp;
  mode: string;
  meta?: ReactNode;
  subject: string;
  typing?: boolean;
  /** Syntax and domain, DNS, the mailbox. */
  steps: [Step, Step, Step];
  /** The verdict in words, null while the server is asked. */
  verdict: string | null;
};

const STEP_NAMES = ['Syntax', 'DNS', 'Mailbox'] as const;

export function VerifyDisplay({ view, compact, hidden }: { view: VerifyView; compact?: boolean; hidden?: boolean }) {
  return (
    <ToolScreen lamp={view.lamp} mode={view.mode} meta={view.meta} compact={compact} hidden={hidden}>
      <p className={cn('lcd mt-6 leading-tight break-all', compact ? 'text-[15px]' : 'text-[17px] sm:mt-8 sm:text-[24px]')}>
        {view.subject || NBSP}
        {view.typing ? <Caret /> : null}
      </p>
      <p
        className={cn(
          'lcd mt-3 leading-[0.95] text-balance uppercase',
          compact ? 'min-h-[1.9em] text-[24px]' : 'min-h-[1em] text-[30px] sm:mt-4 sm:text-[60px]',
          view.verdict === null && 'text-primary motion-safe:animate-pulse',
        )}
      >
        {view.verdict ?? 'Asking'}
      </p>
      <div
        className={cn(
          'mt-6 grid grid-cols-3 gap-3 border-t border-screen-dim pt-5',
          !compact && 'sm:mt-10 sm:pt-7',
        )}
      >
        {view.steps.map((s, i) => (
          <Channel key={STEP_NAMES[i]} name={STEP_NAMES[i]!} lamp={s.lamp} value={s.word} large={!compact} />
        ))}
      </div>
    </ToolScreen>
  );
}

const WAIT: Step = { lamp: 'off', word: 'Wait' };
const BUSY: Step = { lamp: 'busy', word: 'Asking' };
const OK: Step = { lamp: 'good', word: 'Pass' };

/** The running state: the three checks light in turn while the server is asked. */
export function verifyRunning(email: string, ms: number): VerifyView {
  const steps: [Step, Step, Step] = ms < 600 ? [BUSY, WAIT, WAIT] : ms < 1400 ? [OK, BUSY, WAIT] : [OK, OK, BUSY];
  return { lamp: 'busy', mode: 'Running', meta: `${(ms / 1000).toFixed(1)} s`, subject: email, steps, verdict: null };
}

const VERIFY_SAMPLES: { email: string; last: Step; verdict: string; lamp: Lamp }[] = [
  { email: 'hello@northwind.studio', last: { lamp: 'good', word: 'Exists' }, verdict: 'Deliverable', lamp: 'good' },
  { email: 'j.smith@harbordental.com', last: { lamp: 'bad', word: 'Rejected' }, verdict: 'Does not exist', lamp: 'bad' },
  { email: 'sales@kettleandco.io', last: { lamp: 'info', word: 'Says yes' }, verdict: 'Accepts everything', lamp: 'info' },
];

const TYPE_TICKS = 20;
const STEP_TICKS = 5;
const HOLD_TICKS = 32;
const VERIFY_CYCLE = TYPE_TICKS + STEP_TICKS * 3 + HOLD_TICKS;

/** A sample check, typed in and answered, on a loop while in view. */
export function VerifyDemo({ compact }: { compact?: boolean }) {
  const [ref, inView] = useInView<HTMLDivElement>();
  const tick = useTicker(95, inView, VERIFY_CYCLE - 1);
  const n = Math.floor(tick / VERIFY_CYCLE) % VERIFY_SAMPLES.length;
  const s = VERIFY_SAMPLES[n]!;
  const at = tick % VERIFY_CYCLE;
  const typed = s.email.slice(0, Math.ceil((Math.min(at, TYPE_TICKS) / TYPE_TICKS) * s.email.length));
  const k = at - TYPE_TICKS;
  const step = (i: number, done: Step): Step => (k < i * STEP_TICKS ? WAIT : k < (i + 1) * STEP_TICKS ? BUSY : done);
  const answered = k >= STEP_TICKS * 3;
  const view: VerifyView = {
    lamp: answered ? s.lamp : at < TYPE_TICKS ? 'off' : 'busy',
    mode: 'Sample',
    meta: `${String(n + 1).padStart(2, '0')} / ${String(VERIFY_SAMPLES.length).padStart(2, '0')}`,
    subject: typed,
    typing: at < TYPE_TICKS,
    steps: [step(0, OK), step(1, OK), step(2, s.last)],
    verdict: answered ? s.verdict : at < TYPE_TICKS ? '' : null,
  };
  return (
    <div ref={ref}>
      <VerifyDisplay view={view} compact={compact} hidden />
    </div>
  );
}

/* extractor */

export type FoundEmail = { address: string; sourceUrl: string | null };

export type ExtractView = {
  lamp: Lamp;
  mode: string;
  meta?: ReactNode;
  subject: string;
  /** The printed line under the domain: the stage, or the outcome. */
  line: string;
  lit: number;
  dim?: number;
  emails: number;
  people: number;
  list?: FoundEmail[];
  /** Real results link to the page each address was on. */
  links?: boolean;
};

export function ExtractDisplay({ view, compact, hidden }: { view: ExtractView; compact?: boolean; hidden?: boolean }) {
  const list = view.list ?? [];
  return (
    <ToolScreen lamp={view.lamp} mode={view.mode} meta={view.meta} compact={compact} hidden={hidden}>
      <p
        className={cn(
          'lcd mt-6 truncate leading-tight uppercase',
          compact ? 'text-[20px]' : 'text-[22px] sm:mt-8 sm:text-[40px]',
        )}
      >
        {view.subject || NBSP}
      </p>
      <p className={cn('cap mt-2 truncate', view.lamp === 'busy' ? 'text-primary' : 'text-screen-foreground/55')}>{view.line}</p>
      <ScreenMeter lit={view.lit} dim={view.dim} className={cn('mt-4', !compact && 'sm:mt-6')} />
      <div className={cn('mt-6 grid grid-cols-2 gap-3 border-t border-screen-dim pt-5', !compact && 'sm:mt-8 sm:pt-7')}>
        <Readout label="Emails">
          <Figure value={view.emails} ghost="88" className={cn('self-start', compact ? 'text-[34px]' : 'text-[40px] sm:text-[72px]')} />
        </Readout>
        <Readout label="People, hidden">
          <Figure value={view.people} ghost="88" className={cn('self-start', compact ? 'text-[34px]' : 'text-[40px] sm:text-[72px]')} />
        </Readout>
      </div>
      {list.length > 0 ? (
        <ul className={cn('mt-6 border-t border-screen-dim', !compact && 'sm:mt-8')}>
          {list.map((e) => (
            <li
              key={e.address}
              className="flex flex-col gap-1 border-b border-screen-dim py-3 last:border-b-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6"
            >
              <span className="flex min-w-0 items-center gap-2.5 font-mono text-[14px] break-all text-screen-foreground sm:text-[15px]">
                <span aria-hidden="true" className="led shrink-0 bg-chart-1 shadow-[0_0_6px_var(--chart-1)]" />
                {e.address}
              </span>
              {e.sourceUrl && view.links ? (
                <a
                  href={e.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="min-w-0 truncate pl-4 font-mono text-[12px] text-screen-foreground/50 underline-offset-4 outline-none hover:text-screen-foreground hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/40 sm:pl-0"
                >
                  {e.sourceUrl.replace(/^https?:\/\//, '')}
                </a>
              ) : e.sourceUrl ? (
                <span className="min-w-0 truncate pl-4 font-mono text-[12px] text-screen-foreground/50 sm:pl-0">
                  {e.sourceUrl.replace(/^https?:\/\//, '')}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </ToolScreen>
  );
}

/** Progress lines by seconds elapsed. A crawl takes up to about 25 seconds. */
const PROGRESS: [number, string][] = [
  [0, 'Reading robots.txt'],
  [3, 'Home page, then contact, about and team'],
  [9, 'Up to eight pages, one a second'],
  [16, 'Slow site. Still reading'],
  [24, 'Nearly done'],
];

/** The running state: the meter creeps on with the clock, the line names the stage. */
export function extractRunning(domain: string, ms: number): ExtractView {
  const seconds = Math.floor(ms / 1000);
  const line = [...PROGRESS].reverse().find(([at]) => seconds >= at)?.[1] ?? '';
  const p = Math.min(0.94, 0.06 + (ms / 1000) * 0.036);
  return {
    lamp: 'busy',
    mode: 'Reading',
    meta: `${seconds} s`,
    subject: domain,
    line,
    lit: Math.round(p * METER_SEGMENTS),
    dim: Math.min(METER_SEGMENTS, Math.round(p * METER_SEGMENTS) + 3),
    emails: 0,
    people: 0,
  };
}

const EXTRACT_SAMPLES: { domain: string; emails: FoundEmail[]; people: number }[] = [
  {
    domain: 'harbordental.com',
    emails: [
      { address: 'info@harbordental.com', sourceUrl: 'harbordental.com/contact' },
      { address: 'booking@harbordental.com', sourceUrl: 'harbordental.com/appointments' },
    ],
    people: 3,
  },
  {
    domain: 'kettleandco.io',
    emails: [
      { address: 'hello@kettleandco.io', sourceUrl: 'kettleandco.io' },
      { address: 'sales@kettleandco.io', sourceUrl: 'kettleandco.io/imprint' },
      { address: 'press@kettleandco.io', sourceUrl: 'kettleandco.io/about' },
    ],
    people: 5,
  },
];

const READ_TICKS = 44;
const EXTRACT_HOLD = 34;
const EXTRACT_CYCLE = READ_TICKS + EXTRACT_HOLD;

/** A sample read: the meter fills page by page, then the addresses come up. */
export function ExtractDemo({ compact }: { compact?: boolean }) {
  const [ref, inView] = useInView<HTMLDivElement>();
  const tick = useTicker(90, inView, EXTRACT_CYCLE - 1);
  const n = Math.floor(tick / EXTRACT_CYCLE) % EXTRACT_SAMPLES.length;
  const s = EXTRACT_SAMPLES[n]!;
  const at = tick % EXTRACT_CYCLE;
  const p = Math.min(1, at / READ_TICKS);
  const done = p >= 1;
  const shown = Math.floor(s.emails.length * Math.max(0, (p - 0.35) / 0.65));
  const view: ExtractView = {
    lamp: done ? 'good' : 'busy',
    mode: 'Sample',
    meta: `${String(n + 1).padStart(2, '0')} / ${String(EXTRACT_SAMPLES.length).padStart(2, '0')}`,
    subject: s.domain,
    line: done ? `${Math.round(8 * p)} pages read` : `Reading page ${Math.max(1, Math.ceil(8 * p))} of 8`,
    lit: Math.round(p * METER_SEGMENTS),
    dim: Math.min(METER_SEGMENTS, Math.round(p * METER_SEGMENTS) + 4),
    emails: done ? s.emails.length : shown,
    people: Math.round(s.people * Math.max(0, (p - 0.5) / 0.5)),
    list: compact ? undefined : s.emails.slice(0, done ? s.emails.length : shown),
  };
  return (
    <div ref={ref}>
      <ExtractDisplay view={view} compact={compact} hidden />
    </div>
  );
}

/* SPF and DMARC */

export type AuthChannel = { name: string; lamp: Lamp; word: string };

export type AuthView = {
  lamp: Lamp;
  mode: string;
  meta?: ReactNode;
  subject: string;
  /** Records that pass, null while DNS is read. */
  passed: number | null;
  channels: AuthChannel[];
};

export function AuthDisplay({ view, compact, hidden }: { view: AuthView; compact?: boolean; hidden?: boolean }) {
  return (
    <ToolScreen lamp={view.lamp} mode={view.mode} meta={view.meta} compact={compact} hidden={hidden}>
      <p className={cn('lcd mt-6 truncate leading-tight uppercase', compact ? 'text-[20px]' : 'text-[22px] sm:mt-8 sm:text-[40px]')}>
        {view.subject || NBSP}
      </p>
      {compact ? (
        <p className="cap mt-2 text-screen-foreground/55 tabular-nums">
          {view.passed === null ? 'Reading the records' : `${view.passed} of 4 pass`}
        </p>
      ) : (
        <div className="mt-5 flex items-end gap-3 sm:mt-6">
          <Figure value={view.passed ?? ''} ghost="8" className="text-[56px] sm:text-[88px]" />
          <span className={cn('cap pb-1', view.passed === null ? 'text-primary' : 'text-screen-foreground/55')}>
            {view.passed === null ? 'Reading the records' : 'of 4 pass'}
          </span>
        </div>
      )}
      <div
        className={cn(
          'mt-6 grid grid-cols-2 gap-x-3 gap-y-5 border-t border-screen-dim pt-5',
          compact ? '' : 'sm:mt-8 sm:grid-cols-4 sm:pt-7',
        )}
      >
        {view.channels.map((c) => (
          <Channel key={c.name} name={c.name} lamp={c.lamp} value={c.word} large={!compact} />
        ))}
      </div>
    </ToolScreen>
  );
}

const RECORDS = ['MX', 'SPF', 'DMARC', 'DKIM'] as const;

/** The running state: the four records are read in turn, round and round, until DNS answers. */
export function authRunning(domain: string, ms: number): AuthView {
  const at = Math.floor(ms / 500) % RECORDS.length;
  return {
    lamp: 'busy',
    mode: 'Reading DNS',
    meta: `${(ms / 1000).toFixed(1)} s`,
    subject: domain,
    passed: null,
    channels: RECORDS.map((name, i) => ({ name, lamp: i === at ? 'busy' : 'off', word: i === at ? 'Read' : 'Wait' })),
  };
}

const AUTH_SAMPLES: { domain: string; grades: Lamp[] }[] = [
  { domain: 'northwind.studio', grades: ['good', 'good', 'warn', 'good'] },
  { domain: 'kettleandco.io', grades: ['good', 'warn', 'bad', 'good'] },
];

const GRADE_WORD: Partial<Record<Lamp, string>> = { good: 'Pass', warn: 'Warn', bad: 'Fail' };
const RECORD_TICKS = 6;
const AUTH_HOLD = 30;
const AUTH_CYCLE = 8 + RECORDS.length * RECORD_TICKS + AUTH_HOLD;

/** A sample check: each record lights in turn with its grade. */
export function AuthDemo({ compact }: { compact?: boolean }) {
  const [ref, inView] = useInView<HTMLDivElement>();
  const tick = useTicker(110, inView, AUTH_CYCLE - 1);
  const n = Math.floor(tick / AUTH_CYCLE) % AUTH_SAMPLES.length;
  const s = AUTH_SAMPLES[n]!;
  const k = (tick % AUTH_CYCLE) - 8;
  const read = Math.max(0, Math.min(RECORDS.length, Math.floor(k / RECORD_TICKS)));
  const done = read >= RECORDS.length;
  const view: AuthView = {
    lamp: done ? (s.grades.includes('bad') ? 'bad' : s.grades.includes('warn') ? 'warn' : 'good') : 'busy',
    mode: 'Sample',
    meta: `${String(n + 1).padStart(2, '0')} / ${String(AUTH_SAMPLES.length).padStart(2, '0')}`,
    subject: s.domain,
    passed: s.grades.slice(0, read).filter((g) => g === 'good').length,
    channels: RECORDS.map((name, i) =>
      i < read
        ? { name, lamp: s.grades[i]!, word: GRADE_WORD[s.grades[i]!] ?? '' }
        : i === read && k >= 0
          ? { name, lamp: 'busy', word: 'Read' }
          : { name, lamp: 'off', word: 'Wait' },
    ),
  };
  return (
    <div ref={ref}>
      <AuthDisplay view={view} compact={compact} hidden />
    </div>
  );
}
