'use client';

import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { ArrowUpRight, ClipboardList, CornerDownLeft, Globe, Loader2, MapPin, Rocket, Sparkles, X } from 'lucide-react';
import { SEARCH_LIMIT_MAX } from '@nvoke/shared';
import { CountryPicker } from '@/components/app/country-picker';
import { useStartSearch } from '@/components/app/new-search-screen';
import { Pill } from '@/components/app/sentence';
import { APP_FRAME, APP_INSET, BackLink } from '@/components/app/shell';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { countryName, formatNumber } from '@/lib/app/desktop';
import {
  addCountry,
  buildIcpInput,
  DESCRIPTION_MAX,
  emptyIcpForm,
  ICP_EXAMPLES,
  ICP_LIMIT,
  icpProblem,
  PRODUCT_MAX,
  productFromProfile,
  type IcpForm,
} from '@/lib/app/icp';
import { BILLING_PATH, quotaState } from '@/lib/app/quota';
import { useMe, useSiteProfile, useUpdateSearch } from '@/lib/app/queries';
import { displayDomain, WEBSITE_PATH } from '@/lib/app/site-profile';
import { cn } from '@/lib/utils';

/** The older search kinds, one click away but out of the way. */
const OTHER_WAYS = [
  { href: WEBSITE_PATH, icon: Sparkles, title: 'Start from your website' },
  { href: '/app/new?kind=local', icon: MapPin, title: 'Local businesses' },
  { href: '/app/new?kind=web', icon: Globe, title: 'Web search' },
  { href: '/app/new?kind=launches', icon: Rocket, title: 'New launches' },
  { href: '/app/new?kind=domains', icon: ClipboardList, title: 'Paste a list' },
] as const;

const FIELD =
  'h-11 w-full rounded-[16px] bg-foreground/[0.045] px-4 text-sm outline-none transition-[background-color,box-shadow] duration-150 placeholder:text-muted-foreground/60 hover:bg-foreground/[0.07] focus-visible:bg-foreground/[0.07] focus-visible:ring-[3px] focus-visible:ring-ring/25';

/**
 * New search: say who you sell to in plain words, and nvoke plans the
 * queries (kind `icp`). One big field, a few optional ones, and Find leads.
 * The search asks for up to 1,000 companies and, with Keep finding new leads
 * on, is switched to ongoing right after it starts.
 */
export function IcpSearchScreen() {
  const me = useMe();
  const profile = useSiteProfile();
  const start = useStartSearch();
  const update = useUpdateSearch();
  const [form, setForm] = useState<IcpForm>(() => emptyIcpForm());
  const [touched, setTouched] = useState(false);
  const [productEdited, setProductEdited] = useState(false);
  const description = useRef<HTMLTextAreaElement>(null);
  const ids = { description: useId(), product: useId(), countries: useId(), locations: useId(), ongoing: useId() };

  // What you sell comes from your website read when there is one, until you type over it.
  const suggested = productFromProfile(profile.data);
  const [prefilled, setPrefilled] = useState('');
  if (!productEdited && suggested && suggested !== prefilled) {
    setPrefilled(suggested);
    setForm((f) => ({ ...f, product: suggested }));
  }
  const fromProfile = !productEdited && Boolean(suggested) && form.product === suggested;

  useEffect(() => {
    description.current?.focus();
  }, []);

  const set = <K extends keyof IcpForm>(key: K) => (value: IcpForm[K]) => setForm((f) => ({ ...f, [key]: value }));
  const maxLimit = me.data?.maxSearchLimit ?? SEARCH_LIMIT_MAX;
  const input = buildIcpInput(form, maxLimit);
  const quota = me.data ? quotaState(me.data) : null;
  const problem = touched ? icpProblem(form) : null;
  const pending = start.isPending;

  function submit(event?: FormEvent): void {
    event?.preventDefault();
    setTouched(true);
    if (!input) {
      description.current?.focus();
      return;
    }
    start.start(input, (search) => {
      if (!form.ongoing) return;
      // Errors are told by the hook: this screen is gone by the time the answer comes.
      update.mutate({ id: search.id, patch: { ongoing: true } });
    });
  }

  return (
    <main className={cn(APP_FRAME, 'pb-24')}>
      <form onSubmit={submit} noValidate className={cn(APP_INSET, 'flex flex-col pt-8 motion-safe:animate-rise sm:pt-[6vh]')}>
        <BackLink />

        <h1 className="mt-8 font-display text-[34px]/[42px] font-semibold tracking-[-0.035em] text-balance sm:text-5xl/[1.15]">
          <label htmlFor={ids.description}>Who do you sell to?</label>
        </h1>
        <p className="mt-3 max-w-xl text-[15px] text-pretty text-muted-foreground">
          Plain words, like you’d tell a friend. nvoke plans the searches, finds the companies and the people who decide,
          and checks every address with its mail server.
        </p>

        <div className="relative mt-8">
          <textarea
            id={ids.description}
            ref={description}
            value={form.description}
            onChange={(e) => set('description')(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit();
            }}
            rows={3}
            maxLength={DESCRIPTION_MAX + 200}
            placeholder="Marketing agencies in the UK that run paid ads for their clients"
            aria-invalid={Boolean(problem)}
            aria-describedby={problem ? `${ids.description}-problem` : undefined}
            spellCheck
            className="field-sizing-content min-h-[7.5rem] w-full resize-none rounded-[26px] bg-foreground/[0.045] px-5 py-4 font-display text-xl/8 font-medium tracking-[-0.02em] caret-primary outline-none transition-[background-color,box-shadow] duration-200 placeholder:text-foreground/25 hover:bg-foreground/[0.06] focus-visible:bg-foreground/[0.06] focus-visible:ring-[3px] focus-visible:ring-ring/25 aria-invalid:ring-[3px] aria-invalid:ring-destructive/25 sm:px-6 sm:py-5 sm:text-2xl/9"
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-1">
          <span className="mr-1 pl-1 text-xs text-muted-foreground">Try</span>
          {ICP_EXAMPLES.map((example) => (
            <Pill
              key={example}
              pressed={form.description.trim() === example}
              onClick={() => {
                set('description')(example);
                description.current?.focus();
              }}
              className="h-auto min-h-7 py-1 text-left"
            >
              {example}
            </Pill>
          ))}
        </div>

        <div className="mt-12 grid gap-x-8 gap-y-7 md:grid-cols-2">
          <div className="flex flex-col gap-2 md:col-span-2">
            <label htmlFor={ids.product} className="text-sm font-medium">
              What do you sell? <span className="font-normal text-muted-foreground">Optional</span>
            </label>
            <input
              id={ids.product}
              value={form.product}
              onChange={(e) => {
                setProductEdited(true);
                set('product')(e.target.value);
              }}
              maxLength={PRODUCT_MAX}
              placeholder="Cold email infrastructure for agencies"
              autoComplete="off"
              className={FIELD}
            />
            <p className="pl-1 text-xs text-muted-foreground">
              {fromProfile && profile.data
                ? `From your website, ${displayDomain(profile.data.website)}. It tells a buyer from a competitor.`
                : 'It tells a buyer from a competitor.'}
            </p>
          </div>

          <div className="flex min-w-0 flex-col gap-2">
            <label id={ids.countries} htmlFor={`${ids.countries}-add`} className="text-sm font-medium">
              Countries <span className="font-normal text-muted-foreground">Optional</span>
            </label>
            <div role="group" aria-labelledby={ids.countries} className="flex min-h-11 flex-wrap items-center gap-1.5 rounded-[16px] bg-foreground/[0.045] p-1.5">
              {form.countries.map((code) => (
                <span key={code} className="inline-flex h-8 items-center gap-1 rounded-full bg-card pr-1 pl-3 text-[13px] shadow-xs dark:bg-foreground/10">
                  {countryName(code) ?? code}
                  <button
                    type="button"
                    aria-label={`Remove ${countryName(code) ?? code}`}
                    onClick={() => set('countries')(form.countries.filter((c) => c !== code))}
                    className="flex size-6 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-foreground/[0.07] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
              <div className="min-w-36 flex-1">
                <CountryPicker
                  id={`${ids.countries}-add`}
                  value=""
                  onChange={(code) => set('countries')(addCountry(form.countries, code))}
                  anyLabel={form.countries.length ? 'Add another' : 'Anywhere, nvoke picks'}
                  triggerClassName="h-8 rounded-full px-2.5 text-sm text-muted-foreground hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/25 [&_svg]:size-4"
                />
              </div>
            </div>
          </div>

          <div className="flex min-w-0 flex-col gap-2">
            <label htmlFor={ids.locations} className="text-sm font-medium">
              Cities or regions <span className="font-normal text-muted-foreground">Optional</span>
            </label>
            <input
              id={ids.locations}
              value={form.locations}
              onChange={(e) => set('locations')(e.target.value)}
              placeholder="Manchester, Leeds"
              autoComplete="off"
              className={FIELD}
            />
            <p className="pl-1 text-xs text-muted-foreground">For local businesses. Separate with commas.</p>
          </div>
        </div>

        <div className="mt-10 flex items-start justify-between gap-6 rounded-[22px] bg-foreground/[0.03] px-5 py-4">
          <div className="min-w-0">
            <label htmlFor={ids.ongoing} className="text-sm font-medium">
              Keep finding new leads
            </label>
            <p className="mt-1 text-xs text-pretty text-muted-foreground">
              After the first {formatNumber(Math.min(ICP_LIMIT, maxLimit))} companies, nvoke keeps looking and adds
              new ones as it finds them, a few a day. Switch it off any time.
            </p>
          </div>
          <Switch id={ids.ongoing} checked={form.ongoing} onCheckedChange={set('ongoing')} className="mt-0.5" />
        </div>

        <div className="mt-10 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:gap-6">
          <Button type="submit" size="lg" disabled={pending} className="min-w-44">
            {pending ? <Loader2 className="motion-safe:animate-spin" /> : null}
            Find leads
            {!pending && <CornerDownLeft className="size-3.5 opacity-70" />}
          </Button>
          {problem ? (
            <span id={`${ids.description}-problem`} className="text-sm text-destructive">
              {problem}
            </span>
          ) : quota?.level === 'out' ? (
            <p className="max-w-sm text-sm text-muted-foreground">
              This month’s {formatNumber(quota.limit)} verified emails are used, so a search stops at once.{' '}
              <Link href={BILLING_PATH} className="inline-flex items-center gap-0.5 text-primary hover:underline">
                Upgrade
                <ArrowUpRight className="size-3.5" />
              </Link>
            </p>
          ) : (
            <p className="max-w-sm text-xs text-pretty text-muted-foreground">
              Only verified emails count{quota ? `, ${formatNumber(quota.left)} left this month` : ''}. The first people show
              up within a minute. Checking every address takes longer.
            </p>
          )}
        </div>

        <nav aria-label="Other ways to search" className="mt-20 border-t border-border/60 pt-6">
          <h2 className="pl-1 text-xs font-medium text-muted-foreground">Other ways to search</h2>
          <div className="mt-3 flex flex-wrap gap-x-1 gap-y-1.5">
            {OTHER_WAYS.map(({ href, icon: Icon, title }) => (
              <Link
                key={href}
                href={href}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-foreground/70 outline-none transition-colors hover:bg-foreground/[0.05] hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40"
              >
                <Icon className="size-3.5 text-muted-foreground" />
                {title}
              </Link>
            ))}
          </div>
        </nav>
      </form>
    </main>
  );
}
