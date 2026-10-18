import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/site/logo';
import { MobileMenu } from '@/components/site/mobile-menu';
import { Container } from '@/components/site/section';
import { ThemeToggle } from '@/components/site/theme';
import { nav } from '@/lib/site';

/**
 * A slim strip of chassis across the top: the keycap mark and the wordmark,
 * the links printed in mono capitals, then the keys. Start free is the one
 * orange key on every page, so the pages below it use dark and light keys.
 */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background">
      <Container>
        <nav aria-label="Main" className="flex h-14 items-center gap-6">
          <Link
            href="/"
            aria-label="nvoke home"
            className="mr-auto rounded-[4px] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 md:mr-0"
          >
            <Logo />
          </Link>
          <ul className="mr-auto hidden items-center gap-1 md:flex">
            {nav.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="cap rounded-[4px] px-2.5 py-2 text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button asChild size="sm" variant="secondary" className="hidden sm:inline-flex">
              <Link href="/app">Sign in</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/sign-up">Start free</Link>
            </Button>
            <MobileMenu />
          </div>
        </nav>
      </Container>
    </header>
  );
}
