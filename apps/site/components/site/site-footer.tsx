import Link from 'next/link';
import { CookieSettingsLink } from '@/components/site/cookie-settings-link';
import { Logo } from '@/components/site/logo';
import { Container } from '@/components/site/section';
import { footerNav, site } from '@/lib/site';

const row = 'cap flex h-10 items-center border-t text-foreground/80 transition-colors hover:text-foreground';

/** The foot of the sheet: the name plate line, then the links as hairline rows in mono capitals. */
export function SiteFooter() {
  return (
    <footer className="border-t">
      <Container className="grid gap-10 pt-12 pb-10 md:grid-cols-[1fr_2fr] md:gap-16">
        <div className="flex flex-col gap-3">
          <Logo />
          <p className="cap text-primary">Find &#183; Crawl &#183; Verify</p>
          <p className="max-w-xs text-[15px] text-muted-foreground">
            Companies and emails that work. In the browser, and on Windows, macOS and Linux.
          </p>
          <a
            href={`mailto:${site.email.hello}`}
            className="w-fit font-mono text-[13px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            {site.email.hello}
          </a>
        </div>
        <nav aria-label="Footer" className="grid grid-cols-1 gap-8 min-[480px]:grid-cols-3 min-[480px]:gap-6">
          {footerNav.map((group) => (
            <div key={group.label}>
              <h2 className="cap pb-3 text-muted-foreground">{group.label}</h2>
              <ul className="border-b">
                {group.links.map((item) => (
                  <li key={item.href}>
                    <Link href={item.href} className={row}>
                      {item.label}
                    </Link>
                  </li>
                ))}
                {group.label === 'Legal' ? <CookieSettingsLink /> : null}
              </ul>
            </div>
          ))}
        </nav>
      </Container>
      <Container>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t py-5">
          <span className="cap text-muted-foreground">
            &#169; {new Date().getFullYear()} {site.name}
          </span>
          <span className="cap text-muted-foreground">NV-1</span>
        </div>
      </Container>
    </footer>
  );
}
