'use client';

import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowRight, ArrowUpRight, ClipboardList, CornerDownLeft, Globe, Loader2, MapPin, Rocket, Sparkles, X } from 'lucide-react';
import { SEARCH_LIMIT_MAX } from '@nvoke/shared';
import { CountryPicker } from '@/components/app/country-picker';
import { useStartSearch } from '@/components/app/new-search-screen';
import { PLATE } from '@/components/app/search-fields';
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
    <main className={cn(APP_FRAME, 'app-view pb-24')}>
      <div className={cn(APP_INSET, 'pt-6')}>
        <BackLink />
      </div>
      <form onSubmit={submit} noValidate className={cn(APP_INSET, 'mx-auto flex w-full max-w-[760px] flex-col pt-8 sm:pt-[4vh]')}>
        <h1 className="font-display text-3xl font-light text-balance sm:text-4xl">
          <label htmlFor={ids.description}>Who do you sell to?</label>
        </h1>
        <p className={cn('mt-2 max-w-xl text-pretty', NOTE)}>
          Say it like you would to a new hire. nvoke plans the searches, reads every site and finds the people who decide.
        </p>

        <div className="group/line relative mt-7 pb-2">
          <textarea
            id={ids.description}
            ref={description}
            value={form.description}
            onChange={(e) => set('description')(e.target.value)}
            onKeyDown={(e) => {
              // Enter finds leads, Shift+Enter breaks the line.
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit();
              }
            }}
            rows={1}
            maxLength={DESCRIPTION_MAX + 200}
            placeholder="Owner run dental clinics with 3 to 20 staff"
            aria-invalid={Boolean(problem)}
            aria-describedby={problem ? `${ids.description}-problem` : `${ids.description}-examples`}
            spellCheck
            autoComplete="off"
            className="field-sizing-content block max-h-[7.5em] min-h-[1.25em] w-full resize-none overflow-y-auto bg-transparent font-display text-2xl leading-[1.25] font-normal text-pretty caret-primary outline-none placeholder:text-foreground/30 aria-invalid:placeholder:text-destructive/40 sm:text-3xl"
          />
          <span className="absolute inset-x-0 bottom-0 h-px bg-border transition-colors duration-300 group-focus-within/line:bg-primary" />
        </div>

        <div id={`${ids.description}-examples`} className="mt-4 flex flex-wrap items-center gap-2" role="group" aria-label="Examples">
          {ICP_EXAMPLES.map((example) => (
            <Pill
              key={example}
              pressed={form.description.trim() === example}
              onClick={() => {
                set('description')(example);
                description.current?.focus();
              }}
              title={example}
              className={cn('h-auto min-h-7 max-w-full py-1 text-left', EXAMPLE)}
            >
              {example}
            </Pill>
          ))}
        </div>

        <div className="mt-8 grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-[max-content_minmax(0,1fr)] sm:items-baseline">
          <QuietLine
            label="What you sell"
            htmlFor={ids.product}
            hint={fromProfile && profile.data ? `From ${displayDomain(profile.data.website)}` : 'Optional'}
          >
            <input
              id={ids.product}
              value={form.product}
              onChange={(e) => {
                setProductEdited(true);
                set('product')(e.target.value);
              }}
              maxLength={PRODUCT_MAX}
              placeholder="So nvoke skips your competitors"
              autoComplete="off"
              className={QUIET_FIELD}
            />
          </QuietLine>
          <QuietLine label="Countries" htmlFor={`${ids.countries}-add`} hint="Optional">
            <div role="group" aria-label="Countries" className="flex flex-wrap items-center gap-1.5">
              {form.countries.map((code) => (
                <span
                  key={code}
                  className="inline-flex h-6 items-center gap-1 rounded-[3px] bg-secondary pr-1 pl-2.5 font-mono text-[11px] text-secondary-foreground uppercase shadow-[0_1px_0_var(--glass-edge)]"
                >
                  {countryName(code) ?? code.toUpperCase()}
                  <button
                    type="button"
                    aria-label={`Remove ${countryName(code) ?? code}`}
                    onClick={() => set('countries')(form.countries.filter((c) => c !== code))}
                    className="flex size-4 items-center justify-center rounded-[2px] text-muted-foreground outline-none hover:bg-foreground/[0.08] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
              <div className="min-w-44 flex-1">
                <CountryPicker
                  id={`${ids.countries}-add`}
                  value=""
                  chosen={form.countries}
                  onChange={(code) => set('countries')(addCountry(form.countries, code))}
                  anyLabel={form.countries.length ? 'Add a country' : 'Anywhere, nvoke picks'}
                  triggerClassName={cn(QUIET_FIELD, 'text-muted-foreground [&_svg]:size-4')}
                />
              </div>
            </div>
          </QuietLine>
          <QuietLine label="Cities or regions" htmlFor={ids.locations} hint="Optional">
            <input
              id={ids.locations}
              value={form.locations}
              onChange={(e) => set('locations')(e.target.value)}
              placeholder="Austin, Denver. For local businesses."
              autoComplete="off"
              className={QUIET_FIELD}
            />
          </QuietLine>
        </div>

        <label htmlFor={ids.ongoing} className="mt-7 flex cursor-pointer items-start gap-4 self-start">
          <Switch id={ids.ongoing} checked={form.ongoing} onCheckedChange={set('ongoing')} className="mt-0.5" />
          <span>
            <span className="cap block text-foreground">Keep finding new leads</span>
            <span className={cn('mt-0.5 block max-w-md text-pretty', NOTE)}>
              After the first {formatNumber(Math.min(ICP_LIMIT, maxLimit))} companies, nvoke keeps looking and adds new
              people as it finds them, until you switch it off.
            </span>
          </span>
        </label>

        <div className="mt-8 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:gap-6">
          <Button type="submit" size="lg" disabled={pending} className="min-w-40">
            {pending ? <Loader2 className="motion-safe:animate-spin" /> : null}
            Find leads
            {!pending && <CornerDownLeft className="size-3.5 opacity-70" />}
          </Button>
          {problem ? (
            <span id={`${ids.description}-problem`} role="alert" className="text-sm text-destructive">
              {problem}
            </span>
          ) : quota?.level === 'out' ? (
            <p className={cn('max-w-sm', NOTE)}>
              This month’s {formatNumber(quota.limit)} verified emails are used, so a search stops at once.{' '}
              <Link
                href={BILLING_PATH}
                className="inline-flex items-center gap-0.5 font-medium text-foreground underline-offset-4 hover:underline"
              >
                Upgrade
                <ArrowUpRight className="size-3.5" />
              </Link>
            </p>
          ) : (
            <p className={cn('max-w-sm text-pretty', NOTE)}>
              Only verified emails count.
              {quota && (
                <>
                  {' '}
                  <span className="font-medium text-primary">{formatNumber(quota.left)}</span> left this month.
                </>
              )}{' '}
              Results are kept for 12 months.
            </p>
          )}
        </div>

        <nav aria-labelledby="other-ways" className="mt-12">
          <h2 id="other-ways" className="cap text-muted-foreground">
            Other ways to search
          </h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {OTHER_WAYS.map(({ href, icon: Icon, title }) => (
              <Button key={href} asChild variant="secondary" size="sm">
                <Link href={href}>
                  <Icon className="size-3" />
                  {title}
                  <ArrowRight className="size-3 opacity-50" />
                </Link>
              </Button>
            ))}
          </div>
        </nav>
      </form>
    </main>
  );
}

/** Small print under a key. */
const NOTE = 'text-sm text-muted-foreground';
/** The quiet fields: a sunk plate in small mono. */
const QUIET_FIELD = cn(PLATE, 'h-9 w-full min-w-0 py-1.5 text-sm font-normal caret-primary outline-none placeholder:text-muted-foreground/90');
/** An example sentence on a key: too long for capitals. */
const EXAMPLE = 'normal-case tracking-normal text-[11.5px]';

function QuietLine({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint: string; children: ReactNode }) {
  return (
    <div className="contents">
      <label htmlFor={htmlFor} className="flex items-baseline gap-2 pt-2">
        <span className="cap">{label}</span>
        <span className="cap text-muted-foreground">{hint}</span>
      </label>
      <div className="min-w-0 pb-1.5">{children}</div>
    </div>
  );
}
