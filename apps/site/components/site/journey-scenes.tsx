import type { CSSProperties, ReactNode } from 'react';
import { Bell, Braces, Copy, Download, Mail, Rocket, Send, Webhook } from 'lucide-react';
import { VerificationBadge } from '@/components/mockups/primitives';
import type { Verification } from '@/components/mockups/data';
import { LogoMark } from '@/components/site/logo';
import { cn } from '@/lib/utils';

// The drawn fragments of the lead journey (journey.tsx). Pictures, not
// controls: each scene is one image for screen readers, its parts hidden.
// Classes starting with `j-` are animated in app/motion-journey.css.

function delay(ms: number): CSSProperties {
  return { '--d': `${ms}ms` } as CSSProperties;
}

function Scene({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <div role="img" aria-label={label} className={cn('relative w-full max-w-[34rem] select-none', className)}>
      <div aria-hidden="true" className="relative">
        {children}
      </div>
    </div>
  );
}

function Card({ className, children, style }: { className?: string; children: ReactNode; style?: CSSProperties }) {
  return (
    <div className={cn('glass-strong rounded-[26px] p-5 text-[13px] leading-[18px] sm:p-6', className)} style={style}>
      {children}
    </div>
  );
}

function Pill({ children, primary, className }: { children: ReactNode; primary?: boolean; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[12.5px] font-medium whitespace-nowrap',
        primary ? 'bg-primary text-primary-foreground shadow-glow' : 'bg-foreground/[0.05] text-foreground/80',
        className,
      )}
    >
      {children}
    </span>
  );
}

/** 1. No leads: an empty list, and the one lead still out there. */
export function EmptyScene() {
  return (
    <Scene label="An empty list of leads: zero companies, zero emails.">
      <Card className="j-in">
        <div className="flex items-baseline justify-between gap-4">
          <span className="font-medium">Leads</span>
          <span className="text-[12px] text-muted-foreground">this month</span>
        </div>
        <div className="mt-3 font-display text-[64px] leading-none font-extralight tracking-[-0.04em] tabular-nums">
          0
        </div>
        <div className="mt-6 flex flex-col gap-2.5">
          {[0.9, 0.7, 0.5].map((o, i) => (
            <div
              key={i}
              className="h-9 rounded-2xl border border-dashed border-border"
              style={{ opacity: o }}
            />
          ))}
        </div>
        <div className="mt-5 flex items-center gap-2.5 text-muted-foreground">
          <span className="j-seed relative inline-flex size-2 rounded-full bg-primary" />
          Nothing here yet.
        </div>
      </Card>
    </Scene>
  );
}

const KINDS = ['Your website', 'Local', 'Web', 'Launches', 'A list'];

/** 2. Say who you sell to: the sentence types itself, then Start. */
export function DescribeScene() {
  return (
    <Scene label="The search form: who do you sell to, answered with independent dental clinics in Austin, and a Start button.">
      <Card className="j-in">
        <div className="font-medium">Who do you sell to?</div>
        <div className="mt-3 flex h-11 min-w-0 items-center rounded-2xl bg-foreground/[0.04] px-4 text-[14px]">
          <span className="j-type">Independent dental clinics in Austin</span>
          <span className="j-caret ml-px h-4 w-px shrink-0 bg-primary" />
        </div>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {KINDS.map((k, i) => (
            <span
              key={k}
              className={cn(
                'j-in rounded-full px-2.5 py-1 text-[11.5px]',
                i === 0 ? 'bg-foreground/[0.07] text-foreground' : 'bg-foreground/[0.03] text-muted-foreground',
              )}
              style={delay(300 + i * 60)}
            >
              {k}
            </span>
          ))}
        </div>
        <div className="mt-6 flex items-center justify-between gap-4">
          <span className="text-[12px] text-muted-foreground">nvoke plans the searches.</span>
          <Pill primary className="j-press">
            Start
          </Pill>
        </div>
      </Card>
    </Scene>
  );
}

const FOUND: { domain: string; email: string; pages: number; result: Verification }[] = [
  { domain: 'brightsmile.com', email: 'hello@brightsmile.com', pages: 6, result: 'valid' },
  { domain: 'eastaustindental.com', email: 'maria@eastaustindental.com', pages: 5, result: 'valid' },
  { domain: 'barton-creek-dds.com', email: 'office@barton-creek-dds.com', pages: 8, result: 'catch_all' },
  { domain: 'lonestarsmiles.com', email: 'info@lonestarsmiles.com', pages: 4, result: 'invalid' },
];

/** 3. nvoke finds the companies, reads their sites and checks each address. */
export function FindScene({ seen }: { seen: boolean }) {
  return (
    <Scene label="A running search: companies found, their websites read, and each email checked with its mail server. Two valid, one catch-all, one invalid.">
      <Card className="j-in">
        <div className="flex items-center gap-3">
          <LogoMark className="size-7" motion={seen ? 'intro' : undefined} />
          <div className="min-w-0 flex-1">
            <div className="font-medium">Dental clinics in Austin</div>
            <div className="text-[12px] text-muted-foreground">44 sites read, 83 emails checked</div>
          </div>
        </div>
        <div className="mt-4 h-1 overflow-hidden rounded-full bg-foreground/[0.06]">
          <div className="j-progress h-full origin-left rounded-full bg-primary" />
        </div>
        <ul className="mt-4 flex flex-col">
          {FOUND.map((f, i) => (
            <li
              key={f.domain}
              className="j-in flex items-center gap-3 border-t border-border/60 py-2.5 first:border-t-0"
              style={delay(500 + i * 380)}
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-mono text-[12px] text-foreground">{f.email}</div>
                <div className="truncate text-[11px] text-muted-foreground">
                  {f.domain}, {f.pages} pages read
                </div>
              </div>
              <span className="relative inline-flex shrink-0">
                <VerificationBadge value="checking" className="j-check" />
                <VerificationBadge value={f.result} className="j-final" />
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </Scene>
  );
}

const TOOLS = ['Instantly', 'Lemlist', 'HubSpot', 'Gmail'];

/** 4. Hand off: export, copy or API out of nvoke, the sending happens in your tool. */
export function HandoffScene() {
  return (
    <Scene label="Verified leads leave nvoke as a CSV, a copy or over the API, and land in your own email tool, which does the sending.">
      <Card className="j-in">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate font-medium">Dental clinics in Austin</div>
            <div className="text-[12px] text-muted-foreground">46 valid of 83</div>
          </div>
          <LogoMark className="size-6" />
        </div>
        <div className="mt-4 flex flex-wrap gap-1.5">
          <Pill primary className="j-press">
            <Download className="size-3.5" />
            Export CSV
          </Pill>
          <Pill>
            <Copy className="size-3.5" />
            Copy
          </Pill>
          <Pill>
            <Braces className="size-3.5" />
            API
          </Pill>
        </div>
      </Card>

      <div className="relative mx-auto h-14 w-px bg-border">
        <span className="j-handoff absolute left-1/2 size-2.5 -translate-x-1/2 rounded-full bg-primary shadow-glow" />
      </div>

      <Card className="j-in" style={delay(900)}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2 font-medium">
            <Mail className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.5} />
            <span className="truncate">Your email tool</span>
          </div>
          <span className="truncate text-[11px] text-muted-foreground">{TOOLS.join(', ')}</span>
        </div>
        <div className="mt-4 flex flex-col gap-2 rounded-2xl bg-foreground/[0.03] p-3.5">
          <div className="flex gap-2 text-[12px]">
            <span className="w-12 shrink-0 text-muted-foreground">To</span>
            <span className="min-w-0 truncate font-mono">hello@brightsmile.com</span>
          </div>
          <div className="flex items-center gap-2 text-[12px]">
            <span className="w-12 shrink-0 text-muted-foreground">Step 1</span>
            <span className="h-2 w-2/3 rounded-full bg-foreground/[0.08]" />
          </div>
          <div className="flex items-center gap-2 text-[12px]">
            <span className="w-12 shrink-0 text-muted-foreground">Step 2</span>
            <span className="h-2 w-1/2 rounded-full bg-foreground/[0.08]" />
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between gap-3">
          <span className="text-[12px] text-muted-foreground">46 contacts imported</span>
          <span className="j-in inline-flex h-8 items-center gap-1.5 rounded-full bg-foreground text-[12.5px] font-medium text-background px-3.5" style={delay(1500)}>
            <Send className="size-3.5" />
            Send
          </span>
        </div>
      </Card>
    </Scene>
  );
}

// The loop in the automation scene: a rounded track, four stops on it. The
// stops sit where the dot passes, as a share of the track (`at`), so each one
// lights up as the lead goes by. The track starts at the top left stop and
// runs clockwise: 200 straight, a quarter turn (94.25), 140 down, and so on.
const LOOP = 'M100 40H300A60 60 0 0 1 360 100V240A60 60 0 0 1 300 300H100A60 60 0 0 1 40 240V100A60 60 0 0 1 100 40Z';

const STOPS = [
  { title: 'A drop, daily', note: 'Product Hunt, Show HN, YC', icon: Rocket, at: 0, x: '25%', y: '11.8%' },
  { title: 'nvoke', note: 'reads sites, checks emails', icon: null, at: 0.189, x: '75%', y: '11.8%' },
  { title: 'Webhook', note: 'lead.ready to your URL', icon: Webhook, at: 0.5, x: '75%', y: '88.2%' },
  { title: 'Your email tool', note: 'via Zapier, Make or Clay', icon: Send, at: 0.689, x: '25%', y: '88.2%' },
];

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_HEIGHTS = [0.55, 0.8, 0.45, 0.9, 0.65, 0.35, 0.7];

/** 5. Automate: a drop and a webhook, going round every day. */
export function LoopScene() {
  return (
    <Scene
      label="The automated loop: a daily drop finds new launches, nvoke reads their sites and checks the emails, a webhook posts each verified lead to your URL, and your email tool picks it up. Every day."
      className="max-w-[36rem]"
    >
      <div className="j-in relative aspect-[400/340] w-full">
        <svg viewBox="0 0 400 340" className="absolute inset-0 size-full overflow-visible" fill="none">
          <path d={LOOP} pathLength={100} className="stroke-border" strokeWidth={1.5} />
          <path
            d={LOOP}
            pathLength={100}
            className="j-trail stroke-primary"
            strokeWidth={2}
            strokeLinecap="round"
            strokeDasharray="14 86"
          />
          <path
            d={LOOP}
            pathLength={100}
            className="j-lead stroke-primary"
            strokeWidth={9}
            strokeLinecap="round"
            strokeDasharray="0.01 99.99"
          />
        </svg>

        {STOPS.map((s) => {
          const Icon = s.icon;
          return (
            <div
              key={s.title}
              className="j-stop glass-strong absolute flex w-[44%] max-w-[12.5rem] -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-2xl px-2.5 py-2 sm:gap-2.5 sm:px-3"
              style={{ left: s.x, top: s.y, '--at': s.at } as CSSProperties}
            >
              {Icon ? (
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-foreground/[0.05] text-muted-foreground">
                  <Icon className="size-3.5" strokeWidth={1.75} />
                </span>
              ) : (
                <LogoMark className="size-6" />
              )}
              <span className="min-w-0">
                <span className="block truncate text-[12px] leading-4 font-medium">{s.title}</span>
                <span className="block truncate text-[10.5px] leading-[14px] text-muted-foreground">{s.note}</span>
              </span>
            </div>
          );
        })}

        <div className="absolute inset-x-[16%] top-[27%] bottom-[27%] flex flex-col items-center justify-center gap-3 sm:gap-4">
          <div className="j-toast glass flex w-full max-w-[15rem] items-center gap-2.5 rounded-2xl px-3 py-2">
            <Bell className="size-3.5 shrink-0 text-primary" strokeWidth={1.75} />
            <span className="min-w-0">
              <span className="block truncate text-[11.5px] leading-4 font-medium">AI launches</span>
              <span className="block truncate text-[10.5px] leading-[14px] text-muted-foreground">
                14 new launches, 9 valid emails
              </span>
            </span>
          </div>
          <div className="flex h-10 items-end gap-1.5 sm:h-12 sm:gap-2">
            {DAYS.map((d, i) => (
              <div key={d} className="flex h-full w-4 flex-col items-center justify-end gap-1 sm:w-5">
                <div
                  className="j-day w-full origin-bottom rounded-full bg-primary"
                  style={{ height: `${(DAY_HEIGHTS[i] ?? 0.5) * 70}%`, '--i': i } as CSSProperties}
                />
                <span className="text-[9px] leading-none text-muted-foreground">{d[0]}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Scene>
  );
}
