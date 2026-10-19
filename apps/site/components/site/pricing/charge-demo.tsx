'use client';

import { Figure, Readout } from '@/components/mockups/parts';
import { useInView, useTicker } from '@/components/site/home/motion';
import { cn } from '@/lib/utils';

type Result = 'valid' | 'invalid' | 'catch-all' | 'unknown' | 'risky';

/** A made up batch of addresses as a verify run would answer them. */
const BATCH: [string, Result][] = [
  ['hello@northfieldortho.com', 'valid'],
  ['info@brightkiln.studio', 'valid'],
  ['dr.marsh@lakeviewsmile.com', 'invalid'],
  ['office@harborpediatric.com', 'catch-all'],
  ['team@parcelfoundry.io', 'valid'],
  ['sales@quillandloom.co', 'unknown'],
  ['jo@greenmilecpa.com', 'risky'],
  ['contact@ridgelinedental.com', 'valid'],
];

const ROW_TICKS = 5;
const HOLD_TICKS = 24;
const CYCLE = BATCH.length * ROW_TICKS + HOLD_TICKS;

/**
 * The billing rule as a verify run: addresses come back one by one, the
 * checked figure counts every one, the billed figure only the valid ones.
 * Under reduced motion it shows the whole batch answered.
 */
export function ChargeDemo() {
  const [ref, inView] = useInView<HTMLDivElement>();
  const tick = useTicker(140, inView, BATCH.length * ROW_TICKS) % CYCLE;
  const answered = Math.min(BATCH.length, Math.floor(tick / ROW_TICKS));
  const checking = answered < BATCH.length ? answered : -1;
  const billed = BATCH.slice(0, answered).filter(([, r]) => r === 'valid').length;

  return (
    <div
      ref={ref}
      role="img"
      aria-label="A verify run: eight addresses checked, only the four valid ones billed."
      className="screen screen-hero p-5 sm:p-8"
    >
      <div aria-hidden="true">
        <div className="flex items-center gap-3">
          <span className={cn('led', checking >= 0 ? 'led-on motion-safe:animate-blink' : 'bg-chart-1 shadow-[0_0_6px_var(--chart-1)]')} />
          <span className="cap text-screen-foreground/50">{checking >= 0 ? 'Asking mail servers' : 'Done'}</span>
        </div>
        <ul className="mt-5 border-b border-screen-dim">
          {BATCH.map(([address, result], i) => {
            const done = i < answered;
            return (
              <li key={address} className="flex items-center gap-3 border-t border-screen-dim py-2 font-mono text-[12px] sm:text-[12.5px]">
                <span className={cn('min-w-0 truncate', done || i === checking ? 'text-screen-foreground/85' : 'text-screen-foreground/30')}>
                  {address}
                </span>
                <span
                  className={cn(
                    'cap ml-auto shrink-0',
                    !done && i === checking && 'text-primary motion-safe:animate-blink',
                    !done && i !== checking && 'text-transparent',
                    done && result === 'valid' && 'text-chart-1',
                    done && result !== 'valid' && 'text-screen-foreground/40',
                  )}
                >
                  {done ? result : 'check'}
                </span>
              </li>
            );
          })}
        </ul>
        <div className="mt-6 grid grid-cols-2 gap-3">
          <Readout label="Checked">
            <Figure value={answered} ghost="88" className="self-start text-[40px] sm:text-[56px]" />
          </Readout>
          <Readout label="Billed" className="[&>span:first-child]:text-primary">
            <Figure value={billed} ghost="88" className="self-start text-[40px] sm:text-[56px]" />
          </Readout>
        </div>
      </div>
    </div>
  );
}
