import type { ReactNode } from 'react';
import { Plus } from 'lucide-react';

export type FaqItem = { q: string; a: ReactNode };

/** Native details elements: works without JavaScript and stays static. */
export function Faq({ items }: { items: FaqItem[] }) {
  return (
    <div className="divide-y border-y">
      {items.map((item) => (
        <details key={item.q} className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-6 rounded-md py-5 text-left font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
            {item.q}
            <Plus className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-45" />
          </summary>
          <div className="max-w-2xl pb-6 text-pretty text-muted-foreground">{item.a}</div>
        </details>
      ))}
    </div>
  );
}
