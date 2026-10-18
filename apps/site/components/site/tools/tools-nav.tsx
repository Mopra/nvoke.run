import Link from 'next/link';
import { cn } from '@/lib/utils';
import { tools, type ToolSlug } from '@/lib/tools';

/** A row of keys linking every tool; the current one is held down with its LED lit. */
export function ToolsNav({ current }: { current?: ToolSlug }) {
  return (
    <nav aria-label="Free tools">
      <ul className="flex flex-wrap gap-2">
        {tools.map((tool) => {
          const active = tool.slug === current;
          return (
            <li key={tool.slug}>
              <Link
                href={tool.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'key inline-flex h-8 items-center gap-2 bg-secondary px-3 font-mono text-[11.5px] font-medium tracking-[0.07em] text-secondary-foreground uppercase outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40',
                  active ? 'key-down' : 'hover:brightness-[0.97]',
                )}
              >
                <span aria-hidden="true" className={cn('led', active && 'led-on')} />
                {tool.short}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
