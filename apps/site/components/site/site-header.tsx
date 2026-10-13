import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/site/logo';
import { ThemeToggle } from '@/components/site/theme';
import { nav } from '@/lib/site';

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <nav aria-label="Main" className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-5 sm:px-6">
        <Link href="/" className="rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
          <Logo />
          <span className="sr-only">Home</span>
        </Link>
        <ul className="hidden items-center gap-1 md:flex">
          {nav.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="rounded-md px-3 py-2 text-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          <Link
            href="/pricing"
            className="rounded-md px-3 py-2 text-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 md:hidden"
          >
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
