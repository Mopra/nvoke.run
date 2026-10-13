import type { ReactNode } from 'react';
import { Plus } from 'lucide-react';

export type FaqItem = { q: string; a: ReactNode };

/** Native details elements: works without JavaScript and stays static. */
export function Faq({ items }: { items: FaqItem[] }) {
  return (
    <div className="divide-y">
      {items.map((item) => (
        <details key={item.q} className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-6 rounded-md py-7 text-left font-display text-xl font-medium tracking-[-0.018em] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 [&::-webkit-details-marker]:hidden">
            {item.q}
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-foreground/[0.05] text-muted-foreground transition-[transform,background-color] duration-200 group-open:rotate-45 group-hover:bg-foreground/10">
              <Plus className="size-4" />
            </span>
          </summary>
          <div className="max-w-2xl pb-7 text-pretty text-muted-foreground">{item.a}</div>
        </details>
      ))}
    </div>
  );
}
