'use client';

import { Figure, METER_SEGMENTS, Readout, ScreenMeter } from '@/components/mockups/parts';
import { useInView, useTicker } from '@/components/site/home/motion';
import { cn } from '@/lib/utils';

const PROMPT = 'Find 50 dentists in Austin. Only emails that work.';

/** The calls the agent makes, in order, each with the tick it lands on and the answer a few ticks later. */
const CALLS = [
  { at: 30, call: 'POST /v1/agents/signup', reply: '201  nvk_sk_••••  claim email sent' },
  { at: 44, call: 'start_search  local · dentists · Austin', reply: 'queued' },
  { at: 56, call: 'wait_for_search', reply: 'done  48 companies' },
  { at: 126, call: 'get_leads  verification: valid', reply: '71 valid' },
  { at: 146, call: 'export_csv', reply: 'dentists-austin.csv' },
];

const LEADS = [
  { domain: 'southlamardental.com', email: 'hello@' },
  { domain: 'eastsidesmiles.co', email: 'frontdesk@' },
  { domain: 'barton-ortho.com', email: 'info@' },
  { domain: 'mueller-family-dds.com', email: 'office@' },
];

const TICK = 90;
const RUN_FROM = 60;
const RUN_TICKS = 60;
const LEADS_FROM = 130;
const END = 156;
const CYCLE = 200;

/**
 * An agent session on the hero screen: the human's prompt is typed, the
 * agent signs up, starts a search and waits on it while the figures count,
 * then reads the valid leads and exports them. Runs while in view and loops.
 * Reduced motion shows the finished session.
 */
export function AgentSession({ className }: { className?: string }) {
  const [ref, inView] = useInView<HTMLDivElement>();
  const tick = useTicker(TICK, inView, END) % CYCLE;

  const typed = PROMPT.slice(0, tick * 2);
  const p = Math.min(1, Math.max(0, (tick - RUN_FROM) / RUN_TICKS));
  const running = tick >= RUN_FROM && p < 1;
  const done = p >= 1;
  const companies = Math.round(48 * Math.min(1, p * 2.2));
  const emails = Math.round(112 * Math.min(1, Math.max(0, (p - 0.15) / 0.6)));
  const valid = Math.round(71 * Math.max(0, (p - 0.3) / 0.7));
  const lit = Math.round(p * METER_SEGMENTS);
  const dim = Math.round(Math.min(1, p * 2.2) * METER_SEGMENTS);

  return (
    <div
      ref={ref}
      role="img"
      aria-label="An agent session: the agent signs up for nvoke, starts a search for dentists in Austin, waits while it runs, reads the 71 valid leads and exports a CSV."
      className={cn('screen screen-hero relative overflow-hidden', className)}
    >
      <div aria-hidden="true" className="grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
        {/* The transcript: the prompt, then each call and its answer. */}
        <div className="flex min-w-0 flex-col p-5 font-mono text-[12px] leading-[1.7] sm:p-8 sm:text-[12.5px]">
          <div className="flex items-center gap-3">
            <span className={cn('led', tick < END ? 'led-on motion-safe:animate-blink' : 'bg-chart-1 shadow-[0_0_6px_var(--chart-1)]')} />
            <span className="cap text-screen-foreground/50">Agent session</span>
            <span className="cap ml-auto text-screen-foreground/40">MCP</span>
          </div>

          <p className="mt-6 min-h-[3.4em] text-screen-foreground">
            <span className="text-primary">&gt; </span>
            {typed}
            {typed.length < PROMPT.length ? (
              <span className="ml-px inline-block h-[1.1em] w-[0.55em] translate-y-[0.2em] bg-screen-foreground/80 motion-safe:animate-blink" />
            ) : null}
          </p>

          <ol className="mt-4 flex flex-col gap-3">
            {CALLS.map((c) => {
              const shown = tick >= c.at;
              const answered = c.call === 'wait_for_search' ? done : tick >= c.at + 6;
              return (
                <li key={c.call} className={cn('transition-opacity duration-300', shown ? 'opacity-100' : 'opacity-0')}>
                  <p className="truncate text-screen-foreground/85">
                    <span className="text-screen-foreground/35">→ </span>
                    {c.call}
                  </p>
                  <p
                    className={cn(
                      'truncate pl-[1.2em] transition-opacity duration-300',
                      answered ? 'text-chart-1 opacity-100' : 'opacity-0',
                    )}
                  >
                    {c.reply}
                  </p>
                </li>
              );
            })}
          </ol>
        </div>

        {/* The display: the search running, then the leads it found. */}
        <div className="flex min-w-0 flex-col border-t border-screen-dim p-5 sm:p-8 lg:border-t-0 lg:border-l">
          <div className="flex items-center gap-3">
            <span className={cn('cap', running ? 'text-primary' : 'text-screen-foreground/40')}>Run</span>
            <span className={cn('cap', done ? 'text-primary' : 'text-screen-foreground/40')}>Done</span>
            <span className="cap ml-auto text-screen-foreground/50">Local</span>
          </div>
          <p className="lcd mt-5 truncate text-[22px] leading-tight uppercase sm:text-[28px]">Dentists in Austin</p>
          <ScreenMeter lit={lit} dim={dim} className="mt-4" />

          <div className="mt-6 grid grid-cols-3 gap-3 border-t border-screen-dim pt-5">
            <Readout label="Companies">
              <Figure value={companies} ghost="888" className="self-start text-[30px] sm:text-[40px]" />
            </Readout>
            <Readout label="Emails">
              <Figure value={emails} ghost="888" className="self-start text-[30px] sm:text-[40px]" />
            </Readout>
            <Readout label="Valid" className="[&>span:first-child]:text-primary">
              <Figure value={valid} ghost="888" className="self-start text-[30px] sm:text-[40px]" />
            </Readout>
          </div>

          <ul className="mt-6 flex flex-col border-t border-screen-dim pt-3 font-mono text-[12px]">
            {LEADS.map((l, i) => (
              <li
                key={l.domain}
                className={cn(
                  'flex items-center gap-3 py-1.5 transition-[opacity,transform] duration-300 motion-reduce:transition-none',
                  tick >= LEADS_FROM + i * 3 ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0',
                )}
              >
                <span className="led bg-chart-1 shadow-[0_0_6px_var(--chart-1)]" />
                <span className="min-w-0 truncate text-screen-foreground/85">
                  {l.email}
                  {l.domain}
                </span>
                <span className="cap ml-auto shrink-0 text-chart-1">Valid</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
