'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { nav } from '@/lib/site';

const links = [
  ...nav,
  { href: '/tools', label: 'Free tools' },
  { href: '/download', label: 'nvoke Desktop' },
  { href: '/app', label: 'Sign in' },
];

/**
 * The header's links on phones: a light key that drops the page's own paper
 * under the header, edge to edge, its links as large hairline rows with
 * channel numbers. No plate. Closes on navigation, Escape and a tap outside.
 */
export function MobileMenu() {
  // Remembers the page it was opened on, so any navigation closes it.
  const pathname = usePathname();
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const setOpen = (value: boolean | ((open: boolean) => boolean)) =>
    setOpenOn((current) => ((typeof value === 'function' ? value(current === pathname) : value) ? pathname : null));

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenOn(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className="md:hidden">
      <Button
        variant="secondary"
        size="icon-sm"
        aria-expanded={open}
        aria-controls="mobile-menu"
        aria-label={open ? 'Close menu' : 'Open menu'}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <X className="size-3.5" /> : <Menu className="size-3.5" />}
      </Button>
      {open
        ? createPortal(
            <>
              <div aria-hidden="true" className="fixed inset-0 top-[calc(3.5rem+1px)] z-40 bg-scrim md:hidden" onClick={() => setOpen(false)} />
              <nav
                id="mobile-menu"
                aria-label="Menu"
                className="fixed inset-x-0 top-[calc(3.5rem+1px)] z-50 max-h-[calc(100dvh-3.5rem-1px)] overflow-y-auto border-b bg-background px-4 pt-2 pb-8 md:hidden"
              >
                <ul className="flex flex-col">
                  {links.map((link, i) => (
                    <li key={link.href} className="border-b">
                      <Link
                        href={link.href}
                        onClick={() => setOpen(false)}
                        aria-current={pathname === link.href ? 'page' : undefined}
                        className="group grid h-14 grid-cols-[2.5rem_1fr] items-center outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
                      >
                        <span className="cap text-muted-foreground tabular-nums group-aria-[current=page]:text-primary">
                          {String(i + 1).padStart(2, '0')}
                        </span>
                        <span className="text-[22px] font-light tracking-[-0.02em] text-foreground">{link.label}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            </>,
            document.body,
          )
        : null}
    </div>
  );
}
