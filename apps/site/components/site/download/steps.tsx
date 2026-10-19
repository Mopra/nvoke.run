'use client';

import { useInView } from '@/components/site/home/motion';
import { useRunTo } from '@/components/site/pricing/motion';
import { cn } from '@/lib/utils';

const STEPS = [
  ['Install', 'Run the installer.'],
  ['Sign in', 'In your browser. No account yet? You get one, free.'],
  ['Search', 'Your searches from the web app are already there.'],
] as const;

/**
 * After the install, as three huge dot matrix channel numbers on the page.
 * They light one after another the first time they come into view, over
 * ghost 88s, like the figures on the screen.
 */
export function InstallSteps() {
  const [ref, inView] = useInView<HTMLOListElement>('0px 0px -15% 0px', true);
  const lit = useRunTo(STEPS.length, 450, inView);

  return (
    <ol ref={ref} className="mt-16 grid gap-x-10 gap-y-12 sm:mt-24 sm:grid-cols-3">
      {STEPS.map(([name, line], i) => {
        const on = i < lit;
        return (
          <li key={name} className="border-t pt-6">
            <span
              aria-hidden="true"
              className="relative inline-block font-[family-name:var(--font-lcd)] text-[88px] leading-none font-extrabold tabular-nums sm:text-[120px]"
            >
              <span className="text-foreground/[0.06]">88</span>
              <span
                className={cn(
                  'absolute inset-0 transition-colors duration-500 motion-reduce:transition-none',
                  on ? 'text-foreground' : 'text-transparent',
                )}
              >
                {String(i + 1).padStart(2, '0')}
              </span>
            </span>
            <h3 className="mt-6 flex items-center gap-2.5 text-title font-light">
              <span aria-hidden="true" className={cn('led transition-[background-color,box-shadow] duration-300', on && 'led-on')} />
              {name}
            </h3>
            <p className="mt-3 max-w-[16rem] text-[15px] text-pretty text-muted-foreground">{line}</p>
          </li>
        );
      })}
    </ol>
  );
}
