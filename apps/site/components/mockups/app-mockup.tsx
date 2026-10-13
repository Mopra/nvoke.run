import type { CSSProperties } from 'react';
import { Copy, Download, ExternalLink, Globe, MapPin, Plus, Rocket, Search, User } from 'lucide-react';
import { MockWindow } from '@/components/mockups/window';
import { VerificationBadge, type Verification } from '@/components/mockups/verification-badge';
import { cn } from '@/lib/utils';

// Example data only. Company names and domains are made up.
const SEARCHES = [
  { icon: MapPin, title: 'Dentists in Copenhagen', meta: '52 valid of 61', active: true },
  { icon: Globe, title: 'Label printers, Germany', meta: '118 valid of 140' },
  { icon: Rocket, title: 'Launches, last 7 days', meta: '37 valid of 49' },
  { icon: MapPin, title: 'Physiotherapists in Aarhus', meta: '74 valid of 83' },
];

const ROWS: { company: string; domain: string; email: string; kind: 'Generic' | 'Personal'; status: Verification }[] =
  [
    { company: 'Nørrebro Tandlæger', domain: 'nbtand.dk', email: 'kontakt@nbtand.dk', kind: 'Generic', status: 'valid' },
    {
      company: 'Østerbro Tandklinik',
      domain: 'oesterbrotand.dk',
      email: 'mette@oesterbrotand.dk',
      kind: 'Personal',
      status: 'valid',
    },
    { company: 'Vesterbro Tandhus', domain: 'vbtandhus.dk', email: 'info@vbtandhus.dk', kind: 'Generic', status: 'catch_all' },
    {
      company: 'Frederiksberg Tandcenter',
      domain: 'fbtandcenter.dk',
      email: 'klinik@fbtandcenter.dk',
      kind: 'Generic',
      status: 'valid',
    },
    { company: 'Amager Smilklinik', domain: 'amagersmil.dk', email: 'booking@amagersmil.dk', kind: 'Generic', status: 'risky' },
    {
      company: 'Christianshavn Tandlæge',
      domain: 'chtand.dk',
      email: 'jonas.holm@chtand.dk',
      kind: 'Personal',
      status: 'valid',
    },
    { company: 'Valby Tandpleje', domain: 'valbytand.dk', email: 'post@valbytand.dk', kind: 'Generic', status: 'invalid' },
  ];

const COUNTERS = [
  { label: 'Companies', value: '128' },
  { label: 'Crawled', value: '94' },
  { label: 'Emails', value: '61' },
  { label: 'Valid', value: '52' },
];

export function AppMockup({ className }: { className?: string }) {
  return (
    <MockWindow title="nvoke" className={className}>
      <div className="flex min-h-[26rem] text-left">
        <aside className="hidden w-60 shrink-0 flex-col gap-1 border-r border-sidebar-border bg-sidebar p-3 text-sidebar-foreground md:flex">
          <span className="mb-2 flex items-center justify-center gap-1.5 rounded-md bg-sidebar-primary px-3 py-2 text-xs font-medium text-sidebar-primary-foreground">
            <Plus className="size-3.5" />
            New search
          </span>
          {SEARCHES.map(({ icon: Icon, title, meta, active }) => (
            <div
              key={title}
              className={cn(
                'flex items-start gap-2.5 rounded-md px-2.5 py-2',
                active ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-sidebar-foreground/80',
              )}
            >
              <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-xs font-medium">{title}</span>
                <span className="text-[11px] text-muted-foreground">{meta}</span>
              </div>
            </div>
          ))}
          <div className="mt-auto flex items-center gap-2 rounded-md px-2.5 py-2 text-xs text-muted-foreground">
            <User className="size-3.5" />
            Pro plan, 412 of 2,000 used
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3 sm:px-5">
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-semibold">Dentists in Copenhagen</span>
              <span className="text-xs text-muted-foreground">Local businesses, OpenStreetMap</span>
            </div>
            <span className="ml-auto inline-flex items-center gap-1.5 rounded-md border bg-background px-2.5 py-1.5 text-xs font-medium">
              <Download className="size-3.5" />
              Export CSV
            </span>
          </div>

          <div className="grid grid-cols-4 border-b">
            {COUNTERS.map((c) => (
              <div key={c.label} className="flex flex-col gap-0.5 border-r px-4 py-2.5 last:border-r-0 sm:px-5">
                <span className="text-[11px] text-muted-foreground">{c.label}</span>
                <span className="text-sm font-semibold tabular-nums">{c.value}</span>
              </div>
            ))}
          </div>
          <div className="h-0.5 bg-muted" aria-hidden="true">
            <div className="h-full w-3/4 bg-ring" />
          </div>

          <div className="flex items-center gap-2 px-4 py-2.5 sm:px-5">
            <span className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-input bg-background px-2.5 py-1.5 text-xs text-muted-foreground sm:max-w-56">
              <Search className="size-3.5 shrink-0" />
              <span className="truncate">Filter companies</span>
            </span>
            <span className="hidden rounded-md bg-secondary px-2.5 py-1.5 text-xs text-secondary-foreground sm:inline">
              Valid only
            </span>
            <span className="hidden rounded-md px-2.5 py-1.5 text-xs text-muted-foreground sm:inline">All kinds</span>
          </div>

          <table className="w-full table-fixed text-xs">
            <thead className="text-muted-foreground">
              <tr className="border-y bg-muted/50">
                <th className="px-4 py-2 text-left font-medium sm:w-[38%] sm:px-5">Company</th>
                <th className="hidden px-2 py-2 text-left font-medium sm:table-cell">Email</th>
                <th className="hidden w-20 px-2 py-2 text-left font-medium lg:table-cell">Kind</th>
                <th className="w-28 px-4 py-2 text-left font-medium sm:px-5">Status</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row, i) => (
                <tr
                  key={row.email}
                  className="mock-row-in border-b last:border-b-0"
                  style={{ '--row-delay': `${300 + i * 120}ms` } as CSSProperties}
                >
                  <td className="px-4 py-2.5 sm:px-5">
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate font-medium">{row.company}</span>
                      <span className="hidden items-center gap-1 truncate text-[11px] text-muted-foreground sm:flex">
                        {row.domain}
                        <ExternalLink className="size-3" />
                      </span>
                      <span className="truncate font-mono text-[11px] text-muted-foreground sm:hidden">{row.email}</span>
                    </div>
                  </td>
                  <td className="hidden px-2 py-2.5 sm:table-cell">
                    <span className="flex min-w-0 items-center gap-1.5 font-mono text-[11px]">
                      <span className="truncate">{row.email}</span>
                      <Copy className="hidden size-3 shrink-0 text-muted-foreground sm:inline" />
                    </span>
                  </td>
                  <td className="hidden px-2 py-2.5 text-muted-foreground lg:table-cell">{row.kind}</td>
                  <td className="px-4 py-2.5 sm:px-5">
                    <VerificationBadge status={row.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </MockWindow>
  );
}
