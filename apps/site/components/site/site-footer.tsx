import Link from 'next/link';
import { Logo } from '@/components/site/logo';
import { footerNav, site } from '@/lib/site';

export function SiteFooter() {
  return (
    <footer className="text-[13px] text-muted-foreground">
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-5 pt-24 pb-14 sm:px-6 md:flex-row md:items-start md:justify-between">
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
        <nav aria-label="Footer">
          <ul className="flex flex-wrap gap-x-7 gap-y-3">
            {footerNav.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="hover:text-foreground">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <div className="mx-auto max-w-6xl px-5 sm:px-6">
        <div className="pb-10 text-xs text-muted-foreground/70">
          © {new Date().getFullYear()} {site.name}
        </div>
      </div>
    </footer>
  );
}
