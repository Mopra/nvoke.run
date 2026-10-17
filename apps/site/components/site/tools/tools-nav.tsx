import Link from 'next/link';
import { cn } from '@/lib/utils';
import { tools, type ToolSlug } from '@/lib/tools';

/** A row of pills linking every tool, the current one marked. */
export function ToolsNav({ current }: { current?: ToolSlug }) {
  return (
    <nav aria-label="Free tools">
      <ul className="flex flex-wrap justify-center gap-2">
        {tools.map((tool) => {
          const active = tool.slug === current;
          return (
            <li key={tool.slug}>
              <Link
                href={tool.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'inline-flex h-9 items-center rounded-full px-4 text-[13px] outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/40',
                  active
                    ? 'glass font-medium text-foreground'
                    : 'text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground',
                )}
              >
                {tool.short}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
