import Link from 'next/link';
import { CookieSettingsLink } from '@/components/site/cookie-settings-link';
import { Logo } from '@/components/site/logo';
import { Container } from '@/components/site/section';
import { footerNav, site } from '@/lib/site';

export function SiteFooter() {
  return (
    <footer className="text-[13px] text-muted-foreground">
      <Container className="grid gap-12 pt-24 pb-14 md:grid-cols-[1fr_auto] md:gap-16">
        <div className="flex max-w-xs flex-col gap-3">
          <Logo className="text-foreground" />
          <p>Find companies. Get emails that actually work. Windows, macOS and Linux.</p>
          <a
            href={`mailto:${site.email.hello}`}
            className="w-fit font-mono text-xs underline-offset-4 hover:text-foreground hover:underline"
          >
            {site.email.hello}
          </a>
        </div>
        <nav aria-label="Footer" className="grid grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-3 md:gap-x-16">
          {footerNav.map((group) => (
            <div key={group.label} className="flex flex-col gap-4">
              <h2 className="text-xs text-muted-foreground/70">{group.label}</h2>
              <ul className="flex flex-col gap-3">
                {group.links.map((item) => (
                  <li key={item.href}>
                    <Link href={item.href} className="hover:text-foreground">
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
      <Container className="pb-10 text-xs text-muted-foreground/70">
        © {new Date().getFullYear()} {site.name}
      </Container>
    </footer>
  );
}
