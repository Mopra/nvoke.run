import type { CSSProperties } from 'react';
import {
  ArrowUpRight,
  Ban,
  ChevronDown,
  ChevronLeft,
  CircleUser,
  CornerDownLeft,
  Download,
  Ellipsis,
  Globe,
  MapPin,
  Moon,
  Plus,
  Rocket,
  Rows3,
  Search as SearchIcon,
  Sun,
} from 'lucide-react';
import { BAKERIES, SEARCHES, type MockCompany } from '@/components/mockups/data';
import {
  FieldRow,
  Group,
  Kbd,
  MockButton,
  Row,
  SearchBar,
  Segmented,
  StatusDot,
  VerificationBadge,
} from '@/components/mockups/primitives';
import { AppWindow, Sidebar, Toolbar, type Platform } from '@/components/mockups/window';
import { LogoMark } from '@/components/site/logo';
import { cn } from '@/lib/utils';

export const SEARCH_KINDS = [
  { label: 'Local businesses', icon: MapPin },
  { label: 'Web search', icon: Globe },
  { label: 'New launches', icon: Rocket },
];

const COLUMNS = 'grid grid-cols-[minmax(0,15rem)_minmax(0,1fr)_11rem] gap-5';

function Stat({ value, sub, label }: { value: string; sub?: string; label: string }) {
  return (
    <div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-[21px] leading-[26px] font-semibold tracking-[-0.018em] tabular-nums">{value}</span>
        {sub && <span className="text-[11.5px] text-muted-foreground tabular-nums">{sub}</span>}
      </div>
      <div className="mt-0.5 text-[11.5px] text-muted-foreground">{label}</div>
    </div>
  );
}

export function CompanyRow({
  company,
  animate = false,
  index = 0,
  location = true,
}: {
  company: MockCompany;
  animate?: boolean;
  index?: number;
  location?: boolean;
}) {
  return (
    <div
      className={cn(
        location ? COLUMNS : 'grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)] gap-5',
        'px-3 py-2.5',
        animate && 'mock-row-in',
      )}
      style={animate ? ({ '--row-delay': `${300 + index * 140}ms` } as CSSProperties) : undefined}
    >
      <div className="min-w-0 leading-5">
        <div className="truncate font-medium">{company.name}</div>
        <div className="truncate font-mono text-[10.5px] text-muted-foreground">{company.domain}</div>
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        {company.emails.length === 0 ? (
          <span className="text-[11.5px] leading-5 text-muted-foreground">No public email</span>
        ) : (
          company.emails.map((e) => (
            <div key={e.address} className="flex min-w-0 items-center gap-2">
              <span className="truncate font-mono text-[11.5px] leading-5 text-foreground/80 dark:text-foreground/65">
                {e.address}
              </span>
              {e.personal && <span className="shrink-0 text-[10.5px] text-muted-foreground">person</span>}
              <span className="ml-auto" />
              <VerificationBadge value={e.status} />
            </div>
          ))
        )}
      </div>
      {location && (
        <div className="min-w-0 text-[11.5px] leading-5 text-muted-foreground">
          <div className="truncate">{company.location}</div>
          <div className="truncate tabular-nums">{company.phone}</div>
        </div>
      )}
    </div>
  );
}

/** A running search: stats, the pipeline bar, filters and the companies table. */
export function ResultsScreen({ platform, rows = 7, animate = false }: { platform: Platform; rows?: number; animate?: boolean }) {
  const search = SEARCHES[0];
  if (!search) return null;
  return (
    <>
      <Toolbar platform={platform}>
        <ChevronLeft className="-ml-1.5 size-[18px] text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] leading-5 font-semibold tracking-[-0.01em]">Bakeries in Aarhus</div>
          <div className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5 font-medium">
              <StatusDot status="running" />
              Running
            </span>
            Local businesses, just now, running for 17s
          </div>
        </div>
        <MockButton variant="ghost" icon={Ban}>
          Stop
        </MockButton>
        <MockButton icon={Download}>Export CSV</MockButton>
        <Ellipsis className="mx-1 size-4 text-muted-foreground" />
      </Toolbar>
      <section className="shrink-0 px-6 pt-2 pb-5">
        <div className="grid grid-cols-4 gap-6">
          <Stat value="70" sub="of 80" label="Companies" />
          <Stat value="69" label="Websites crawled" />
          <Stat value="91" label="Emails found" />
          <Stat value="42" sub="46%" label="Valid emails" />
        </div>
        <div className="mt-5 flex items-center gap-4">
          <SearchBar search={{ ...search, found: 92, crawled: 86 }} className="h-1.5 flex-1" />
          <span className="shrink-0 text-[11.5px] text-muted-foreground tabular-nums">69 of 70 websites crawled</span>
        </div>
      </section>
      <div className="flex shrink-0 items-center gap-2 px-6 pb-3">
        <div className="relative flex h-7 w-64 items-center gap-2 rounded-[8px] bg-foreground/[0.05] px-2.5 text-muted-foreground/70">
          <SearchIcon className="size-3.5" />
          <span className="flex-1">Filter companies and emails</span>
          <Kbd className="bg-transparent">{platform === 'mac' ? '⌘ F' : 'Ctrl F'}</Kbd>
        </div>
        <span className="inline-flex h-7 items-center gap-1.5 rounded-[8px] bg-foreground/[0.05] px-2.5 text-[12.5px] text-foreground/80">
          Any verification
          <ChevronDown className="size-3 opacity-60" />
        </span>
        <Segmented options={[{ label: 'All' }, { label: 'Generic' }, { label: 'Personal' }]} selected={0} className="w-48" />
        <span className="ml-auto text-[11.5px] text-muted-foreground tabular-nums">70 companies</span>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden px-3">
        <div className={cn(COLUMNS, 'px-3 py-1.5 text-[11.5px] font-medium text-muted-foreground')}>
          <span>Company</span>
          <span>Emails</span>
          <span>Location</span>
        </div>
        {BAKERIES.slice(0, rows).map((c, i) => (
          <CompanyRow key={c.domain} company={c} animate={animate} index={i} />
        ))}
      </div>
    </>
  );
}

const SEARCH_GRID = 'grid grid-cols-[minmax(0,1fr)_minmax(10rem,15rem)_4.5rem_5.5rem] items-center gap-6';

export function SearchRow({ index, compact = false }: { index: number; compact?: boolean }) {
  const s = SEARCHES[index];
  if (!s) return null;
  const label = { running: 'Running', done: 'Done', failed: 'Failed', canceled: 'Canceled' }[s.status];
  return (
    <div
      className={cn(
        compact ? 'grid grid-cols-[minmax(0,1fr)_9rem_3.5rem] items-center gap-6' : SEARCH_GRID,
        'rounded-lg px-3 py-3',
        index === 1 && !compact && 'bg-accent',
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex w-3 justify-center">
          <StatusDot status={s.status} />
        </span>
        <div className="min-w-0">
          <div className="truncate font-medium">{s.title}</div>
          <div className="truncate text-[11.5px] text-muted-foreground">
            {label}, {s.kind}
          </div>
        </div>
      </div>
      <div className="flex min-w-0 flex-col gap-1.5">
        <SearchBar search={s} />
        <div className="truncate text-[11.5px] text-muted-foreground">{s.caption}</div>
      </div>
      <div className="text-right">
        <div className="font-semibold tabular-nums">{s.emails.toLocaleString('en-US')}</div>
        <div className="text-[11.5px] text-muted-foreground tabular-nums">{s.valid} valid</div>
      </div>
      {!compact && <div className="text-right text-[11.5px] text-muted-foreground">{s.when}</div>}
    </div>
  );
}

/** The searches list, with its large title. */
export function SearchesScreen({ platform }: { platform: Platform }) {
  return (
    <>
      <Toolbar platform={platform}>
        <span className="flex-1" />
        <MockButton icon={Plus}>New search</MockButton>
      </Toolbar>
      <div className="flex-1 overflow-hidden px-5">
        <div className="mx-auto max-w-[920px]">
          <div className="px-3 pt-1 pb-5">
            <div className="text-[28px] leading-8 font-bold tracking-[-0.024em]">Searches</div>
            <div className="mt-1 text-muted-foreground">5 searches, 1 running</div>
          </div>
          <div className="px-3 pb-1.5 text-[11.5px] font-semibold text-muted-foreground">In progress</div>
          <SearchRow index={0} />
          <div className="mt-6 px-3 pb-1.5 text-[11.5px] font-semibold text-muted-foreground">Earlier</div>
          <div className="flex flex-col gap-px">
            {SEARCHES.slice(1).map((s, i) => (
              <SearchRow key={s.title} index={i + 1} />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

/** The new search form, local businesses selected. */
export function NewSearchForm({ kind = 0, className }: { kind?: number; className?: string }) {
  const fields = [
    {
      hint: 'Businesses on OpenStreetMap that list a website, inside the area you name.',
      rows: [
        { label: 'Kind of business', value: 'Dentists' },
        { label: 'Where', value: 'Copenhagen' },
      ],
    },
    {
      hint: 'Company websites from a web search. Social networks and marketplaces are left out.',
      rows: [
        { label: 'Keyword', value: 'headless cms' },
        { label: 'Country', value: 'Germany' },
      ],
    },
    {
      hint: 'Products launched recently on Product Hunt and Show HN.',
      rows: [
        { label: 'Keyword', value: 'ai' },
        { label: 'Launched within', value: 'Last 7 days' },
      ],
    },
  ][kind];
  if (!fields) return null;
  return (
    <div className={cn('flex flex-col', className)}>
      <Segmented options={SEARCH_KINDS} selected={kind} className="h-[28px]" />
      <p className="mt-2 px-3 text-[11.5px] text-muted-foreground">{fields.hint}</p>
      <Group className="mt-5">
        {fields.rows.map((r, i) => (
          <FieldRow key={r.label} label={r.label} value={r.value} focused={i === 0} />
        ))}
      </Group>
      <Group className="mt-5">
        <Row label="Companies to find">
          <Segmented
            options={[{ label: '25' }, { label: '100' }, { label: '250' }, { label: '500' }]}
            selected={1}
            className="w-[136px] [&>span]:px-1.5"
          />
        </Row>
      </Group>
      <p className="mt-1.5 px-3.5 text-[11.5px] text-muted-foreground">
        Only emails count toward your plan. You have 404 left this month.
      </p>
      <div className="mt-6 flex items-center justify-end gap-2">
        <MockButton variant="ghost">Cancel</MockButton>
        <MockButton>
          Start search
          <CornerDownLeft className="size-3.5 opacity-70" />
        </MockButton>
      </div>
    </div>
  );
}

/** The command bar (Ctrl K or Cmd K) over a dimmed window. */
export function CommandBar({ className }: { className?: string }) {
  const actions = [
    { icon: MapPin, label: 'Find local businesses' },
    { icon: Globe, label: 'Search the web' },
    { icon: Rocket, label: 'Browse new launches' },
    { icon: Rows3, label: 'All searches' },
    { icon: CircleUser, label: 'Account and plan' },
  ];
  return (
    <div
      className={cn(
        'w-[600px] overflow-hidden rounded-2xl border bg-popover text-popover-foreground shadow-lg backdrop-blur-2xl backdrop-saturate-150',
        className,
      )}
    >
      <div className="flex h-14 items-center gap-3 border-b px-4">
        <SearchIcon className="size-[18px] text-muted-foreground" />
        <span className="flex-1 text-[17px] tracking-[-0.01em]">
          dent<span className="ml-px inline-block h-5 w-px translate-y-1 bg-primary" />
        </span>
        <Kbd>esc</Kbd>
      </div>
      <div className="p-1.5">
        <div className="px-2.5 pt-2 pb-1 text-[11.5px] font-semibold text-muted-foreground">Searches</div>
        <div className="flex h-[30px] items-center gap-2.5 rounded-lg bg-accent px-2.5">
          <span className="flex size-4 items-center justify-center">
            <StatusDot status="done" />
          </span>
          <span>Dentists in Copenhagen</span>
          <span className="text-[11.5px] text-muted-foreground">Local businesses</span>
          <span className="ml-auto flex items-center gap-2 text-[11.5px] text-muted-foreground tabular-nums">
            83 emails
            <CornerDownLeft className="size-3.5" />
          </span>
        </div>
        <div className="px-2.5 pt-3 pb-1 text-[11.5px] font-semibold text-muted-foreground">Actions</div>
        {actions.map((a) => (
          <div key={a.label} className="flex h-[30px] items-center gap-2.5 px-2.5">
            <a.icon className="size-4 text-muted-foreground" />
            {a.label}
          </div>
        ))}
        {/* The appearance switch offers the other mode, as in the app. */}
        <div className="flex h-[30px] items-center gap-2.5 px-2.5">
          <Moon className="size-4 text-muted-foreground dark:hidden" />
          <Sun className="hidden size-4 text-muted-foreground dark:block" />
          <span className="dark:hidden">Use dark appearance</span>
          <span className="hidden dark:inline">Use light appearance</span>
        </div>
      </div>
    </div>
  );
}

/** Windows 11 window on the results of a running search. The hero shot. */
export function WindowsResultsWindow({ animate = false }: { animate?: boolean }) {
  return (
    <AppWindow platform="windows" sidebar={<Sidebar platform="windows" current={0} />}>
      <ResultsScreen platform="windows" animate={animate} />
    </AppWindow>
  );
}

/** macOS window on the searches list, with the command bar open. */
export function MacCommandWindow() {
  return (
    <AppWindow
      platform="mac"
      sidebar={<Sidebar platform="mac" current="searches" />}
      overlay={
        <>
          <div className="absolute inset-0 bg-scrim/80" />
          <CommandBar className="absolute top-[108px] left-1/2 -translate-x-1/2" />
        </>
      }
    >
      <SearchesScreen platform="mac" />
    </AppWindow>
  );
}

/** The signed-out window: the first thing a new install shows. */
export function MacSignedOutWindow() {
  return (
    <AppWindow platform="mac">
      <div className="relative flex flex-1 flex-col items-center justify-center text-center">
        <div className="halo absolute top-1/2 left-1/2 size-[560px] -translate-x-1/2 -translate-y-1/2 opacity-30" />
        <LogoMark className="relative size-[52px]" />
        <div className="relative mt-4 text-[28px] leading-8 font-semibold tracking-[-0.024em]">nvoke</div>
        <div className="relative mt-1.5 text-[14px] text-muted-foreground">
          Find companies and the emails that reach them.
        </div>
        <MockButton className="relative mt-7 h-8 w-[340px] justify-center text-[14px]">
          Sign in with your browser
          <ArrowUpRight className="size-3.5 opacity-80" />
        </MockButton>
        <div className="relative mt-3.5 text-[11.5px] text-muted-foreground">Your password never touches this app.</div>
      </div>
    </AppWindow>
  );
}
