'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { nav } from '@/lib/site';

const links = [...nav, { href: '/tools', label: 'Free tools' }, { href: '/download', label: 'nvoke Desktop' }];

const item =
  'flex h-12 items-center rounded-[16px] px-4 text-base text-foreground/80 outline-none transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40';

/**
 * The header's links on phones, where the island has no room for them: a
 * button that drops a glass panel under the island. Closes on navigation,
 * Escape and a tap outside. The panel is portaled to the body: inside the
 * island's backdrop filter its own blur would see nothing behind it.
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
      <button
        type="button"
        aria-expanded={open}
        aria-controls="mobile-menu"
        aria-label={open ? 'Close menu' : 'Open menu'}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex size-10 cursor-pointer items-center justify-center rounded-full text-foreground/70 outline-none transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40"
      >
        {open ? <X className="size-[18px]" /> : <Menu className="size-[18px]" />}
      </button>
      {open
        ? createPortal(
            <>
              <div aria-hidden="true" className="fixed inset-0 z-40 md:hidden" onClick={() => setOpen(false)} />
              <nav
                id="mobile-menu"
                aria-label="Menu"
                className="glass-strong fixed inset-x-5 top-[4.5rem] z-50 rounded-[24px] p-2 md:hidden"
              >
                <ul className="flex flex-col">
                  {links.map((link) => (
                    <li key={link.href}>
                      <Link href={link.href} onClick={() => setOpen(false)} className={item}>
                        {link.label}
                      </Link>
                    </li>
                  ))}
                  <li className="mt-1 border-t border-border/60 pt-1">
                    <Link href="/app" onClick={() => setOpen(false)} className={item}>
                      Sign in
                    </Link>
                  </li>
                </ul>
              </nav>
            </>,
            document.body,
          )
        : null}
    </div>
  );
}
