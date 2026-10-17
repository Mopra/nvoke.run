import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/site/logo';
import { Container } from '@/components/site/section';
import { ThemeToggle } from '@/components/site/theme';
import { nav } from '@/lib/site';

const link =
  'rounded-full px-3.5 py-1.5 text-[13px] text-foreground/65 outline-none transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40';

/**
 * The island: one floating glass capsule across the page frame, like the one
 * in the desktop app. Its edges line up with the content. The page scrolls
 * under it.
 */
export function SiteHeader() {
  return (
    <header className="pointer-events-none sticky top-0 z-40 pt-4">
      <Container>
        <nav
          aria-label="Main"
          className="glass pointer-events-auto flex h-12 w-full items-center gap-1 rounded-full pr-1.5 pl-4 md:grid md:grid-cols-[1fr_auto_1fr]"
        >
          <Link
            href="/"
            className="mr-auto rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 md:mr-0 md:justify-self-start"
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
          <div className="flex items-center gap-1 md:justify-self-end">
            <Link href="/pricing" className={`${link} md:hidden`}>
              Pricing
            </Link>
            <ThemeToggle />
            <Link href="/app" className={`${link} hidden sm:inline-flex`}>
              Sign in
            </Link>
            <Button asChild size="sm" className="h-9 px-4">
              <Link href="/sign-up">Start free</Link>
            </Button>
          </div>
        </nav>
      </Container>
    </header>
  );
}
