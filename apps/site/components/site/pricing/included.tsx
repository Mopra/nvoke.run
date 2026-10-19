'use client';

import { useInView } from '@/components/site/home/motion';
import { useRunTo } from '@/components/site/pricing/motion';
import { cn } from '@/lib/utils';

const ITEMS = [
  'Every search kind',
  'Mailbox verification',
  'CSV export',
  'API and MCP',
  'Unlimited searches',
  'Unlimited companies',
] as const;

/** What every plan holds, as channels on hairlines. The LEDs light one by one as it comes into view. */
export function Included() {
  const [ref, inView] = useInView<HTMLUListElement>('0px 0px -15% 0px', true);
  const lit = useRunTo(ITEMS.length, 180, inView);

  return (
    <ul ref={ref} className="mt-14 grid gap-x-10 sm:mt-20 sm:grid-cols-2 lg:grid-cols-3">
      {ITEMS.map((item, i) => (
        <li key={item} className="flex items-center gap-3 border-t py-5">
          <span aria-hidden="true" className={cn('led transition-[background-color,box-shadow] duration-300', i < lit && 'led-on')} />
          <span className={cn('cap transition-colors duration-300', i < lit ? 'text-foreground' : 'text-muted-foreground')}>{item}</span>
          <span aria-hidden="true" className="cap ml-auto text-muted-foreground tabular-nums">
            {String(i + 1).padStart(2, '0')}
          </span>
        </li>
      ))}
    </ul>
  );
}
