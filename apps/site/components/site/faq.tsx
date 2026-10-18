import type { ReactNode } from 'react';

export type FaqItem = { q: string; a: ReactNode };

/**
 * Questions as hairline rows with channel numbers, the way the app lists
 * things. Native details elements: works without JavaScript and stays static.
 */
export function Faq({ items }: { items: FaqItem[] }) {
  return (
    <div className="border-b">
      {items.map((item, i) => (
        <details key={item.q} className="group border-t">
          <summary className="grid cursor-pointer list-none grid-cols-[2.25rem_1fr_auto] items-baseline gap-3 py-5 text-left outline-none transition-colors hover:bg-foreground/[0.035] focus-visible:ring-[3px] focus-visible:ring-ring/40 sm:grid-cols-[3rem_1fr_auto] [&::-webkit-details-marker]:hidden">
            <span className="cap text-muted-foreground tabular-nums">{String(i + 1).padStart(2, '0')}</span>
            <span className="text-[17px] leading-snug text-pretty sm:text-lg">{item.q}</span>
            <span
              aria-hidden="true"
              className="cap pr-1 text-muted-foreground transition-transform duration-200 group-open:rotate-45 motion-reduce:transition-none"
            >
              +
            </span>
          </summary>
          <div className="max-w-2xl pb-6 pl-[calc(2.25rem+0.75rem)] text-[15px] text-pretty text-muted-foreground sm:pl-[calc(3rem+0.75rem)] sm:text-base">
            {item.a}
          </div>
        </details>
      ))}
    </div>
  );
}
