import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/site/logo';
import { ThemeToggle } from '@/components/site/theme';
import { nav } from '@/lib/site';

const link =
  'rounded-full px-3 py-1.5 text-[13px] text-foreground/70 outline-none transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40';

/** A thin frosted bar, like the toolbar of a translucent window. */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/72 backdrop-blur-2xl backdrop-saturate-150">
      <nav aria-label="Main" className="mx-auto grid h-13 max-w-6xl grid-cols-[1fr_auto_1fr] items-center px-5 sm:px-6">
        <Link
          href="/"
          className="w-fit rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
          aria-label="nvoke home"
        >
          <Logo />
        </Link>
        <ul className="hidden items-center gap-1 md:flex">
          {nav.map((item) => (
            <li key={item.href}>
              <Link href={item.href} className={link}>
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
        <div className="col-start-3 flex items-center justify-end gap-1 sm:gap-2">
          <Link href="/pricing" className={`${link} md:hidden`}>
            Pricing
          </Link>
          <ThemeToggle />
          <Button asChild size="sm">
            <Link href="/download">Download</Link>
          </Button>
        </div>
      </nav>
    </header>
  );
}
