import type { CSSProperties } from 'react';
import {
  ArrowUpRight,
  Ban,
  ChevronDown,
  CircleUser,
  CornerDownLeft,
  Download,
  Globe,
  MapPin,
  Moon,
  Rocket,
  Rows3,
  Search as SearchIcon,
  Sun,
} from 'lucide-react';
import { BAKERIES, SEARCHES, type MockCompany } from '@/components/mockups/data';
import { Kbd, MockButton, SearchBar, Segmented, StatusDot, VerificationBadge } from '@/components/mockups/primitives';
import { AppWindow, Island, MoreButton, TopBar, type Platform } from '@/components/mockups/window';
import { LogoMark } from '@/components/site/logo';
import { cn } from '@/lib/utils';

export const SEARCH_KINDS = [
  { label: 'Local businesses', icon: MapPin },
  { label: 'Web search', icon: Globe },
  { label: 'New launches', icon: Rocket },
];

const COLUMNS = 'grid grid-cols-[minmax(0,15rem)_minmax(0,1fr)_11rem] gap-6';

/** A figure as the app sets it: a large thin numeral over a quiet label. */
function Stat({ value, sub, label }: { value: string; sub?: string; label: string }) {
  return (
    <div>
      <div className="flex items-baseline gap-2">
        <span className="font-display text-[44px] leading-[50px] font-extralight tracking-[-0.036em] tabular-nums">
          {value}
        </span>
        {sub && <span className="text-[13px] text-muted-foreground tabular-nums">{sub}</span>}
      </div>
      <div className="mt-1 text-[13px] text-muted-foreground">{label}</div>
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
        location ? COLUMNS : 'grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)] gap-6',
        'px-6 py-4',
        animate && 'mock-row-in',
      )}
      style={animate ? ({ '--row-delay': `${300 + index * 140}ms` } as CSSProperties) : undefined}
    >
      <div className="min-w-0 leading-5">
        <div className="truncate text-[14px] font-medium">{company.name}</div>
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

/** The dock: filters and export floating over the list, in glass. */
function Dock({ platform }: { platform: Platform }) {
  return (
    <div className="absolute inset-x-0 bottom-6 z-10 flex justify-center">
      <div className="glass flex h-12 items-center gap-1 rounded-full px-1.5">
        <div className="flex h-9 w-64 items-center gap-2 rounded-full bg-foreground/[0.045] px-3.5 text-muted-foreground/70">
          <SearchIcon className="size-3.5" />
          <span className="flex-1">Filter companies and emails</span>
          <Kbd className="bg-transparent">{platform === 'mac' ? '⌘ F' : 'Ctrl F'}</Kbd>
        </div>
        <span className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[11.5px] font-medium text-muted-foreground">
          Any verification
          <ChevronDown className="size-3 opacity-60" />
        </span>
        <Segmented
          options={[{ label: 'All' }, { label: 'Generic' }, { label: 'Personal' }]}
          selected={0}
          className="bg-transparent [&>span]:text-[11.5px]"
        />
        <span className="px-3 text-[11.5px] text-muted-foreground tabular-nums">70 companies</span>
        <MockButton icon={Download}>Export CSV</MockButton>
      </div>
    </div>
  );
}

/** A running search: display title, thin figures, the pipeline line and the companies. */
export function ResultsScreen({ platform, rows = 7, animate = false }: { platform: Platform; rows?: number; animate?: boolean }) {
  const search = SEARCHES[0];
  if (!search) return null;
  return (
    <>
      <TopBar
        platform={platform}
        back
        actions={
          <>
            <MockButton variant="glass" icon={Ban}>
              Stop
            </MockButton>
            <MoreButton />
          </>
        }
      />
      <Island platform={platform} />
      <div className="relative min-h-0 flex-1 overflow-hidden px-8 [mask-image:linear-gradient(to_bottom,black_calc(100%-140px),transparent)]">
        <section className="px-6 pt-8 pb-10">
          <div className="font-display text-[34px] leading-[40px] font-semibold tracking-[-0.03em]">Bakeries in Lisbon</div>
          <div className="mt-2 flex items-center gap-2.5 text-[13px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5 text-[11.5px] font-medium">
              <StatusDot status="running" />
              Running
            </span>
            Local businesses, just now, running for 17s
          </div>
          <div className="mt-10 grid grid-cols-4 gap-8">
            <Stat value="70" sub="of 80" label="Companies" />
            <Stat value="69" label="Websites crawled" />
            <Stat value="91" label="Emails found" />
            <Stat value="42" sub="46%" label="Valid emails" />
          </div>
          <div className="mt-8 flex items-center gap-5">
            <SearchBar search={{ ...search, found: 92, crawled: 86 }} className="h-[3px] flex-1" />
            <span className="shrink-0 text-[11.5px] text-muted-foreground tabular-nums">69 of 70 websites crawled</span>
          </div>
        </section>
        <div className={cn(COLUMNS, 'px-6 py-2 text-[11.5px] text-muted-foreground')}>
          <span>Company</span>
          <span>Emails</span>
          <span>Location</span>
        </div>
        {BAKERIES.slice(0, rows).map((c, i) => (
          <CompanyRow key={c.domain} company={c} animate={animate} index={i} />
        ))}
      </div>
      <Dock platform={platform} />
    </>
  );
}

export function SearchRow({ index, compact = false }: { index: number; compact?: boolean }) {
  const s = SEARCHES[index];
  if (!s) return null;
  const label = { running: 'Running', done: 'Done', failed: 'Failed', canceled: 'Canceled' }[s.status];
  const active = s.status === 'running';
  return (
    <div className={cn('flex items-center gap-8 rounded-[24px]', compact ? 'px-5 py-4' : 'px-6 py-5')}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-3">
          {(active || s.status === 'failed') && <StatusDot status={s.status} />}
          <span className="truncate font-display text-[17px] leading-[22px] font-medium tracking-[-0.012em]">{s.title}</span>
        </div>
        <div className="mt-1 truncate text-[13px] text-muted-foreground">
          {s.status === 'done' ? '' : `${label}, `}
          {s.kind}, {s.when}
        </div>
        {active && (
          <div className="mt-4 flex max-w-md items-center gap-4">
            <SearchBar search={s} className="h-[3px] flex-1" />
            <span className="shrink-0 text-[11.5px] text-muted-foreground tabular-nums">{s.caption}</span>
          </div>
        )}
      </div>
      <div className="shrink-0 text-right">
        <div className="font-display text-[34px] leading-[40px] font-light tracking-[-0.03em] tabular-nums">
          {s.emails.toLocaleString('en-US')}
        </div>
        <div className="text-[11.5px] text-muted-foreground tabular-nums">emails, {s.valid} valid</div>
      </div>
    </div>
  );
}

/** The searches list, with its display title. */
export function SearchesScreen({ platform }: { platform: Platform }) {
  return (
    <>
      <TopBar platform={platform} />
      <div className="flex-1 overflow-hidden px-8">
        <div className="mx-auto max-w-[880px]">
          <div className="px-6 pt-10 pb-10">
            <div className="font-display text-[44px] leading-[50px] font-semibold tracking-[-0.036em]">Searches</div>
            <div className="mt-2 text-[14px] text-muted-foreground">5 searches, 1 running</div>
          </div>
          <SearchRow index={0} />
          <div className="mt-10 flex flex-col gap-1">
            {SEARCHES.slice(1).map((s, i) => (
              <SearchRow key={s.title} index={i + 1} />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

/** One line of the sentence composer: a quiet lead word, then the value in display type. */
function Line({
  lead,
  value,
  suffix,
  focused = false,
  chevron = false,
}: {
  lead: string;
  value: string;
  suffix?: string;
  focused?: boolean;
  chevron?: boolean;
}) {
  return (
    <>
      <span className="pb-2 font-display text-[44px] leading-[50px] font-semibold tracking-[-0.036em] text-muted-foreground/50">
        {lead}
      </span>
      <span
        className={cn(
          'relative flex items-center pb-2 font-display text-[44px] leading-[50px] font-semibold tracking-[-0.036em]',
          'after:absolute after:inset-x-0 after:bottom-0 after:h-px',
          focused ? 'after:bg-primary/70' : 'after:bg-border',
        )}
      >
        {value}
        {focused && <span className="ml-0.5 inline-block h-10 w-[2px] bg-primary" />}
        {suffix && <span className="ml-5 text-muted-foreground/50">{suffix}</span>}
        {chevron && <ChevronDown className="ml-auto size-6 text-muted-foreground/60" strokeWidth={1.75} />}
      </span>
    </>
  );
}

/** The new search composer: a sentence in display type. */
export function NewSearchForm({ kind = 0, className }: { kind?: number; className?: string }) {
  const sentence = [
    {
      hint: 'Businesses on OpenStreetMap with a website, inside the area you name.',
      lines: [
        { lead: 'Find', value: 'dentists' },
        { lead: 'in', value: 'Austin' },
      ],
    },
    {
      hint: 'Company websites from a web search. No social networks, no marketplaces.',
      lines: [
        { lead: 'Find', value: 'headless CMS' },
        { lead: 'in', value: 'Germany', chevron: true },
      ],
    },
    {
      hint: 'Fresh launches from Product Hunt and Show HN.',
      lines: [
        { lead: 'Find', value: 'ai' },
        { lead: 'from the', value: 'last 7 days', chevron: true },
      ],
    },
  ][kind];
  if (!sentence) return null;
  return (
    <div className={cn('flex flex-col', className)}>
      <Segmented options={SEARCH_KINDS} selected={kind} className="self-start" />
      <p className="mt-3 pl-1 text-[13px] text-muted-foreground">{sentence.hint}</p>
      <div className="mt-10 grid grid-cols-[max-content_minmax(0,1fr)] gap-x-6 gap-y-3">
        {sentence.lines.map((l, i) => (
          <Line key={l.lead} lead={l.lead} value={l.value} focused={i === 0} chevron={l.chevron} />
        ))}
        <Line lead="up to" value="100" suffix="companies" />
      </div>
      <div className="mt-12 flex items-center gap-6">
        <MockButton className="h-11 px-6 text-[15px]">
          Start search
          <CornerDownLeft className="size-3.5 opacity-70" />
        </MockButton>
        <span className="text-[11.5px] text-muted-foreground">Only verified emails count toward your plan.</span>
      </div>
    </div>
  );
}

/** The command bar (Ctrl K or Cmd K): the island, opened. */
export function CommandBar({ className }: { className?: string }) {
  const actions = [
    { icon: MapPin, label: 'Find local businesses' },
    { icon: Globe, label: 'Search the web' },
    { icon: Rocket, label: 'Browse new launches' },
    { icon: Rows3, label: 'All searches' },
    { icon: CircleUser, label: 'Account and plan' },
  ];
  return (
    <div className={cn('glass-strong w-[640px] overflow-hidden rounded-[28px] text-popover-foreground', className)}>
      <div className="flex h-16 items-center gap-3.5 border-b px-5">
        <SearchIcon className="size-5 text-muted-foreground" strokeWidth={1.75} />
        <span className="flex-1 font-display text-[21px] tracking-[-0.02em]">
          dent<span className="ml-px inline-block h-6 w-px translate-y-1 bg-primary" />
        </span>
        <Kbd>esc</Kbd>
      </div>
      <div className="p-2">
        <div className="px-3 pt-3 pb-1.5 text-[11.5px] text-muted-foreground">Searches</div>
        <div className="flex h-10 items-center gap-3 rounded-[16px] bg-foreground/[0.07] px-3">
          <span className="flex size-4 items-center justify-center">
            <StatusDot status="done" />
          </span>
          <span>Dentists in Austin</span>
          <span className="text-[11.5px] text-muted-foreground">Local businesses</span>
          <span className="ml-auto flex items-center gap-2 text-[11.5px] text-muted-foreground tabular-nums">
            83 emails
            <CornerDownLeft className="size-3.5" />
          </span>
        </div>
        <div className="px-3 pt-3 pb-1.5 text-[11.5px] text-muted-foreground">Actions</div>
        {actions.map((a) => (
          <div key={a.label} className="flex h-10 items-center gap-3 px-3 text-foreground/85">
            <a.icon className="size-4 text-muted-foreground" />
            {a.label}
          </div>
        ))}
        {/* The appearance switch offers the other mode, as in the app. */}
        <div className="flex h-10 items-center gap-3 px-3 text-foreground/85">
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
    <AppWindow platform="windows" live>
      <ResultsScreen platform="windows" animate={animate} />
    </AppWindow>
  );
}

/** macOS window on the searches list, with the command bar open from the island. */
export function MacCommandWindow() {
  return (
    <AppWindow
      platform="mac"
      live
      overlay={
        <>
          <div className="absolute inset-0 bg-scrim/50 backdrop-blur-[6px]" />
          <CommandBar className="absolute top-[10px] left-1/2 -translate-x-1/2" />
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
      <div className="relative flex flex-1 flex-col items-center justify-center px-10 text-center">
        <div className="aura absolute top-[40%] left-1/2 h-[520px] w-[680px] -translate-x-1/2 -translate-y-1/2 rounded-full motion-safe:animate-breathe" />
        <LogoMark className="relative size-[64px]" />
        <div className="relative mt-9 max-w-[420px] font-display text-[40px] leading-[46px] font-semibold tracking-[-0.036em] text-balance">
          Find companies. Get emails that actually work.
        </div>
        <MockButton className="relative mt-10 h-11 px-7 text-[15px]">
          Sign in with your browser
          <ArrowUpRight className="size-3.5 opacity-80" />
        </MockButton>
        <div className="relative mt-4 text-[11.5px] text-muted-foreground">Your password never touches this app.</div>
      </div>
    </AppWindow>
  );
}
