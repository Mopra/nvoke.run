'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export const DOCS_NAV = [
  { href: '/docs', label: 'Quickstart' },
  { href: '/docs/api', label: 'REST API' },
  { href: '/docs/mcp', label: 'MCP server' },
  { href: '/docs/webhooks', label: 'Webhooks' },
  { href: '/docs/agents', label: 'Agent sign-up' },
];

const EXTRA = [
  { href: '/agents.md', label: 'agents.md' },
  { href: '/llms.txt', label: 'llms.txt' },
];

const ROW =
  'flex items-center gap-2.5 border-t py-2.5 text-[15px] outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/40';

function Links({ onPick }: { onPick?: () => void }) {
  const path = usePathname();
  return (
    <div className="flex flex-col gap-6">
      <ul className="border-b">
        {DOCS_NAV.map((item) => {
          const on = path === item.href;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={onPick}
                aria-current={on ? 'page' : undefined}
                className={cn(ROW, on ? 'text-foreground' : 'text-muted-foreground hover:text-foreground')}
              >
                <span aria-hidden className={cn('led', on && 'led-on')} />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-col gap-2">
        <p className="cap text-muted-foreground">For agents</p>
        <ul className="border-b">
          {EXTRA.map((item) => (
            <li key={item.href}>
              <a href={item.href} className={cn(ROW, 'font-mono text-[13px] text-muted-foreground hover:text-foreground')}>
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Side nav on wide screens; a collapsed menu at the top on phones. */
export function DocsNav() {
  const path = usePathname();
  const current = DOCS_NAV.find((i) => i.href === path)?.label ?? 'Docs';
  return (
    <>
      <nav aria-label="Docs" className="sticky top-24 hidden self-start lg:block">
        <p className="cap pb-2 text-muted-foreground">Docs</p>
        <Links />
      </nav>
      <details className="group border-y lg:hidden" key={path}>
        <summary className="flex cursor-pointer list-none items-center justify-between py-3 outline-none [&::-webkit-details-marker]:hidden">
          <span className="flex items-center gap-3">
            <span className="cap text-muted-foreground">Docs</span>
            <span className="text-[15px]">{current}</span>
          </span>
          <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <div className="pb-4">
          <Links />
        </div>
      </details>
    </>
  );
}
