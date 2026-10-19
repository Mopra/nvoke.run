'use client';

import Link from 'next/link';
import { useInView, useTicker } from '@/components/site/home/motion';
import { cn } from '@/lib/utils';

export type Door = { title: string; body: string; href: string; cta: string; signal: string };

/** The ways in as columns on a hairline. A request lands on each in turn: its LED lights and its signal shows. */
export function Doors({ doors }: { doors: Door[] }) {
  const [ref, inView] = useInView<HTMLOListElement>();
  const tick = useTicker(1400, inView, -1);
  const on = tick < 0 ? -1 : tick % doors.length;

  return (
    <ol ref={ref} className="mt-12 grid gap-x-10 sm:mt-16 md:grid-cols-3">
      {doors.map((d, i) => (
        <li key={d.title} className="flex flex-col gap-3 border-t py-6">
          <span className="flex items-center gap-3">
            <span className={cn('led transition-[background-color,box-shadow] duration-300', on === i && 'led-on')} />
            <span
              className={cn(
                'cap font-mono text-primary transition-opacity duration-300 motion-reduce:opacity-0',
                on === i ? 'opacity-100' : 'opacity-0',
              )}
            >
              {d.signal}
            </span>
          </span>
          <h3 className="text-title font-light">{d.title}</h3>
          <p className="max-w-xs flex-1 text-[15px] text-pretty text-muted-foreground">{d.body}</p>
          <Link href={d.href} className="cap mt-2 text-foreground underline underline-offset-4 hover:decoration-2">
            {d.cta}
          </Link>
        </li>
      ))}
    </ol>
  );
}
