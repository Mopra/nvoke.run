import Link from 'next/link';
import { Logo } from '@/components/site/logo';
import { footerNav, site } from '@/lib/site';

export function SiteFooter() {
  return (
    <footer className="border-t border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-12 sm:px-6 md:grid-cols-[1fr_auto]">
        <div className="flex max-w-sm flex-col gap-3">
          <Logo />
          <p className="text-sm text-muted-foreground">
            A lead finder for Windows, macOS and Linux. Made in {site.company.country}.
          </p>
          <a
            href={`mailto:${site.email.hello}`}
            className="w-fit text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            {site.email.hello}
          </a>
        </div>
        <nav aria-label="Footer">
          <ul className="grid grid-cols-2 gap-x-10 gap-y-2 text-sm sm:grid-cols-3 md:grid-cols-1">
            {footerNav.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="text-muted-foreground hover:text-foreground">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <div className="mx-auto max-w-6xl px-5 pb-8 text-xs text-muted-foreground sm:px-6">
        {site.company.legalName}
        {site.company.cvr ? `, CVR ${site.company.cvr}` : null}
      </div>
    </footer>
  );
}
