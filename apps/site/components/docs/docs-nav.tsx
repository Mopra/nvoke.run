'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export const DOCS_NAV = [
  { href: '/docs', label: 'Quickstart' },
  { href: '/docs/api', label: 'REST API' },
  { href: '/docs/mcp', label: 'MCP server' },
  { href: '/docs/agents', label: 'Agent sign-up' },
];

const EXTRA = [
  { href: '/agents.md', label: 'agents.md' },
  { href: '/llms.txt', label: 'llms.txt' },
];

function Links({ onPick }: { onPick?: () => void }) {
  const path = usePathname();
  return (
    <ul className="flex flex-col gap-0.5">
      {DOCS_NAV.map((item) => (
        <li key={item.href}>
          <Link
            href={item.href}
            onClick={onPick}
            aria-current={path === item.href ? 'page' : undefined}
            className={cn(
              'block rounded-full px-4 py-2 text-sm outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/40',
              path === item.href
                ? 'bg-foreground/[0.07] font-medium text-foreground'
                : 'text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground',
            )}
          >
            {item.label}
          </Link>
        </li>
      ))}
      <li className="mt-4 px-4 pb-1 text-[11px] tracking-wide text-muted-foreground/80 uppercase">For agents</li>
      {EXTRA.map((item) => (
        <li key={item.href}>
          <a
            href={item.href}
            className="block rounded-full px-4 py-2 font-mono text-[13px] text-muted-foreground outline-none hover:bg-foreground/[0.04] hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40"
          >
            {item.label}
          </a>
        </li>
      ))}
    </ul>
  );
}

/** Side nav on wide screens; a collapsed menu at the top on phones. */
export function DocsNav() {
  const path = usePathname();
  const current = DOCS_NAV.find((i) => i.href === path)?.label ?? 'Docs';
  return (
    <>
      <nav aria-label="Docs" className="sticky top-24 hidden self-start lg:block">
        <Links />
      </nav>
      <details className="group glass rounded-3xl lg:hidden" key={path}>
        <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-3.5 text-sm font-medium outline-none [&::-webkit-details-marker]:hidden">
          <span>
            <span className="text-muted-foreground">Docs / </span>
            {current}
          </span>
          <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <div className="px-1.5 pb-3">
          <Links />
        </div>
      </details>
    </>
  );
}
