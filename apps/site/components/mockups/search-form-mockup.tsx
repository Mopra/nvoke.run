import { MockField } from '@/components/mockups/window';
import { cn } from '@/lib/utils';

export type SearchKind = 'local' | 'web' | 'launches';

const TABS: { kind: SearchKind; label: string }[] = [
  { kind: 'local', label: 'Local' },
  { kind: 'web', label: 'Web' },
  { kind: 'launches', label: 'Launches' },
];

const FIELDS: Record<SearchKind, { label: string; value: string }[]> = {
  local: [
    { label: 'Niche', value: 'dentists' },
    { label: 'Location', value: 'Copenhagen' },
  ],
  web: [
    { label: 'Keyword', value: 'label printers' },
    { label: 'Country', value: 'Germany' },
  ],
  launches: [
    { label: 'Keyword (optional)', value: 'analytics' },
    { label: 'Launched in', value: 'Last 7 days' },
  ],
};

/** The New search panel from the app, with one tab selected. */
export function SearchFormMockup({ kind, className }: { kind: SearchKind; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-4 rounded-xl border bg-card p-4 text-card-foreground', className)}>
      <div className="flex gap-1 rounded-lg bg-muted p-1 text-xs" aria-hidden="true">
        {TABS.map((t) => (
          <span
            key={t.kind}
            className={cn(
              'flex-1 truncate rounded-md px-2 py-1 text-center',
              t.kind === kind ? 'bg-background font-medium text-foreground shadow-xs' : 'text-muted-foreground',
            )}
          >
            {t.label}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {FIELDS[kind].map((f) => (
          <MockField key={f.label} label={f.label} value={f.value} />
        ))}
      </div>
      <div className="flex items-end justify-between gap-3">
        <MockField label="Max companies" value="100" className="w-28" />
        <span className="rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground">Start search</span>
      </div>
    </div>
  );
}
