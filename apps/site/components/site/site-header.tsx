import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/site/logo';
import { ThemeToggle } from '@/components/site/theme';
import { nav } from '@/lib/site';

const link =
  'rounded-full px-3.5 py-1.5 text-[13px] text-foreground/65 outline-none transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40';

/**
 * The island: one floating glass capsule at the top center, like the one in
 * the desktop app. The page scrolls under it.
 */
export function SiteHeader() {
  return (
    <header className="pointer-events-none sticky top-0 z-40 flex justify-center px-4 pt-4">
      <nav
        aria-label="Main"
        className="glass pointer-events-auto flex h-12 w-full max-w-[640px] items-center gap-1 rounded-full pr-1.5 pl-4"
      >
        <Link
          href="/"
          className="mr-auto rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
          aria-label="nvoke home"
        >
          <Logo />
        </Link>
        <ul className="hidden items-center md:flex">
          {nav.map((item) => (
            <li key={item.href}>
              <Link href={item.href} className={link}>
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
        <Link href="/pricing" className={`${link} md:hidden`}>
          Pricing
        </Link>
        <ThemeToggle />
        <Button asChild size="sm" className="h-9 px-4">
          <Link href="/download">Download</Link>
        </Button>
      </nav>
    </header>
  );
}
