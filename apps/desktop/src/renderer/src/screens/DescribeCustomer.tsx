import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode, type RefObject } from 'react';
import { ArrowRight, ClipboardList, CornerDownLeft, Globe, Loader2, MapPin, Rocket, X } from 'lucide-react';
import { BackButton, PageHeader } from '@/components/AppShell';
import { CountryPicker } from '@/components/CountryPicker';
import { FIELD_NOTE, FIELD_PLATE } from '@/components/SearchForm';
import { Pill } from '@/components/Sentence';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { countryName } from '@/lib/countries';
import { formatNumber } from '@/lib/format';
import { useMe, useSiteProfile } from '@/lib/queries';
import { navigate } from '@/lib/router';
import { ICP_LIMIT, useStartIcp } from '@/lib/start-search';
import type { IcpSearchParams } from '@nvoke/shared';
import { cn } from '@/lib/utils';

/** Plain words that make a good search: who, how big, where, a signal. */
export const ICP_EXAMPLES = [
  'B2B SaaS startups with 10 to 50 people hiring their first sales rep',
  'Owner run dental clinics that still take bookings by phone',
  'Shopify brands doing 1 to 10 million a year in sales',
  'Marketing agencies with 5 to 30 people that build websites for clients',
] as const;

/** Grows a textarea with its text, up to its CSS max-height, where it scrolls. */
function useAutoHeight(ref: RefObject<HTMLTextAreaElement | null>, value: string): void {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [ref, value]);
}

const DESCRIPTION_MAX = 2000;
const PRODUCT_MAX = 1000;
const PLACES_MAX = 30;

/** "Austin, Denver ,  Boulder" as a list, repeats and blanks dropped. */
export function splitPlaces(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(/[,;\n]/)) {
    const place = raw.trim().replace(/\s+/g, ' ').slice(0, 200);
    if (!place || seen.has(place.toLowerCase())) continue;
    seen.add(place.toLowerCase());
    out.push(place);
  }
  return out.slice(0, PLACES_MAX);
}

/** The request the form makes, or null while there is no description. */
export function icpParams(values: { description: string; product: string; countries: string[]; places: string }): IcpSearchParams | null {
  const description = values.description.trim().slice(0, DESCRIPTION_MAX);
  if (!description) return null;
  const product = values.product.trim().slice(0, PRODUCT_MAX);
  const locations = splitPlaces(values.places);
  return {
    description,
    ...(product ? { product } : {}),
    ...(values.countries.length > 0 ? { countries: values.countries.slice(0, PLACES_MAX) } : {}),
    ...(locations.length > 0 ? { locations } : {}),
  };
}

/**
 * New search: "Who do you sell to?" in plain words, and nvoke plans the
 * queries itself (`icp`). What you sell comes from your site profile when
 * there is one. The search asks for up to 1000 companies and, unless switched
 * off, keeps finding new leads after that. The other kinds sit below.
 * docs/desktop/people.md.
 */
export function DescribeCustomer() {
  const [description, setDescription] = useState('');
  const [product, setProduct] = useState('');
  const [productEdited, setProductEdited] = useState(false);
  const [countries, setCountries] = useState<string[]>([]);
  const [places, setPlaces] = useState('');
  const [ongoing, setOngoing] = useState(true);
  const [touched, setTouched] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);
  const productField = useRef<HTMLTextAreaElement>(null);
  const profile = useSiteProfile();
  const me = useMe();
  const start = useStartIcp();

  useEffect(() => field.current?.focus(), []);

  // What the site says it sells stands in until the user types their own.
  const offer = profile.data?.profile.offer ?? '';
  const productValue = productEdited ? product : product || offer;
  const productFromSite = !productEdited && !product && !!offer;

  useAutoHeight(field, description);
  useAutoHeight(productField, productValue);

  const params = icpParams({ description, product: productValue, countries, places });
  const limit = Math.min(ICP_LIMIT, me.data?.maxSearchLimit ?? ICP_LIMIT);
  const remaining = me.data ? Math.max(0, me.data.usage.emailsLimit - me.data.usage.emailsVerified) : null;
  const audience = profile.data?.profile.audience ?? null;

  function submit(event?: FormEvent): void {
    event?.preventDefault();
    setTouched(true);
    if (!params) {
      field.current?.focus();
      return;
    }
    start.start(params, { ongoing, limit });
  }

  function pickExample(text: string): void {
    setDescription(text);
    setTouched(false);
    field.current?.focus();
  }

  const invalid = touched && !params;

  return (
    <>
      <PageHeader leading={<BackButton />} newSearch={false} />
      <main className="fade-edges flex-1 overflow-auto px-8 pb-24">
        <form onSubmit={submit} noValidate className="mx-auto flex max-w-[760px] flex-col pt-[4vh] motion-safe:animate-view-in">
          <label htmlFor="icp-description" className="font-display text-4xl font-semibold text-balance field:font-light">
            Who do you sell to?
          </label>
          <p className={cn('mt-2 max-w-xl text-pretty text-base text-muted-foreground', FIELD_NOTE)}>
            Say it like you would to a new hire. nvoke plans the searches, reads every site and finds the people who decide.
          </p>

          <div className="group/line relative mt-7 pb-2">
            <textarea
              id="icp-description"
              ref={field}
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                setTouched(false);
              }}
              onKeyDown={(e) => {
                // Enter finds leads, Shift+Enter breaks the line.
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  submit();
                }
              }}
              rows={1}
              maxLength={DESCRIPTION_MAX}
              spellCheck
              autoComplete="off"
              aria-invalid={invalid}
              aria-describedby="icp-examples"
              placeholder="Owner run dental clinics with 3 to 20 staff"
              className="block max-h-[7.5em] w-full resize-none overflow-y-auto bg-transparent font-display text-3xl leading-[1.25] font-semibold text-pretty caret-primary outline-none placeholder:text-foreground/[0.17] aria-invalid:placeholder:text-destructive/40 field:font-normal"
            />
            <span className="absolute inset-x-0 bottom-0 h-px bg-border transition-colors duration-300 group-focus-within/line:bg-primary/70" />
          </div>

          <div id="icp-examples" className="mt-3 -ml-3 flex flex-wrap items-center gap-1" role="group" aria-label="Examples">
            {audience && (
              <Pill onClick={() => pickExample(audience)} className={cn('max-w-full truncate', FIELD_EXAMPLE)} title={audience}>
                <span className="font-medium text-foreground">From your site:</span> {audience}
              </Pill>
            )}
            {ICP_EXAMPLES.map((example) => (
              <Pill key={example} onClick={() => pickExample(example)} className={cn('max-w-full truncate', FIELD_EXAMPLE)} title={example}>
                {example}
              </Pill>
            ))}
          </div>

          <div className="mt-8 grid grid-cols-[max-content_minmax(0,1fr)] items-baseline gap-x-8 gap-y-3">
            <QuietLine label="What you sell" htmlFor="icp-product" hint={productFromSite ? 'From your site' : 'Optional'}>
              <textarea
                id="icp-product"
                ref={productField}
                value={productValue}
                onChange={(e) => {
                  setProduct(e.target.value);
                  setProductEdited(true);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    submit();
                  }
                }}
                rows={1}
                maxLength={PRODUCT_MAX}
                autoComplete="off"
                placeholder="So nvoke skips your competitors"
                className={cn(QUIET_FIELD, 'block max-h-[4.5em] resize-none overflow-y-auto text-pretty', FIELD_PLATE, FIELD_QUIET)}
              />
            </QuietLine>
            <QuietLine label="Countries" htmlFor="icp-countries" hint="Optional">
              <div className="flex flex-wrap items-center gap-1.5">
                {countries.map((code) => (
                  <span
                    key={code}
                    className="inline-flex h-7 items-center gap-1 rounded-full bg-foreground/[0.06] pr-1 pl-3 text-sm field:rounded-[3px] field:bg-secondary field:font-mono field:text-[10px] field:uppercase field:shadow-[0_1px_0_var(--glass-edge)]"
                  >
                    {countryName(code) ?? code.toUpperCase()}
                    <button
                      type="button"
                      aria-label={`Remove ${countryName(code) ?? code}`}
                      onClick={() => setCountries((list) => list.filter((c) => c !== code))}
                      className="flex size-5 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-foreground/[0.08] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
                <div className="min-w-44 flex-1">
                  <CountryPicker
                    id="icp-countries"
                    value=""
                    chosen={countries}
                    label={countries.length === 0 ? 'Anywhere, nvoke picks' : 'Add a country'}
                    onChange={(code) => {
                      if (!code) setCountries([]);
                      else
                        setCountries((list) =>
                          list.includes(code) ? list.filter((c) => c !== code) : [...list, code].slice(0, PLACES_MAX),
                        );
                    }}
                    triggerClassName={cn(QUIET_FIELD, 'text-muted-foreground/70 [&_svg]:size-4', FIELD_PLATE, FIELD_QUIET)}
                  />
                </div>
              </div>
            </QuietLine>
            <QuietLine label="Cities or regions" htmlFor="icp-places" hint="Optional">
              <input
                id="icp-places"
                value={places}
                onChange={(e) => setPlaces(e.target.value)}
                autoComplete="off"
                placeholder="Austin, Denver. For local businesses."
                className={cn(QUIET_FIELD, FIELD_PLATE, FIELD_QUIET)}
              />
            </QuietLine>
          </div>

          <label htmlFor="icp-ongoing" className="mt-7 flex cursor-default items-start gap-4 self-start">
            <Switch id="icp-ongoing" checked={ongoing} onCheckedChange={setOngoing} className="mt-0.5" />
            <span>
              <span className="block text-base font-medium field:cap field:text-foreground">Keep finding new leads</span>
              <span className={cn('mt-0.5 block max-w-md text-pretty text-sm text-muted-foreground', FIELD_NOTE)}>
                After the first {formatNumber(limit)} companies, nvoke keeps looking and adds new people as it finds them, until you
                switch it off.
              </span>
            </span>
          </label>

          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
            <Button type="submit" size="lg" disabled={start.isPending} className="min-w-40">
              {start.isPending ? <Loader2 className="motion-safe:animate-spin" /> : null}
              Find leads
              {!start.isPending && <CornerDownLeft className="size-3.5 opacity-70" />}
            </Button>
            {invalid ? (
              <span role="alert" className="text-sm text-destructive field:font-mono field:text-[10.5px]">
                Say who you sell to first.
              </span>
            ) : (
              <p className={cn('max-w-sm text-xs text-muted-foreground', FIELD_NOTE)}>
                Only verified emails count.
                {remaining !== null && (
                  <>
                    {' '}
                    <span className="field:font-medium field:text-primary">{formatNumber(remaining)}</span> left this month.
                  </>
                )}{' '}
                Results are kept for 12 months.
              </p>
            )}
          </div>

          <OtherWays />
        </form>
      </main>
    </>
  );
}

const QUIET_FIELD =
  'w-full min-w-0 bg-transparent py-0.5 font-display text-lg font-medium caret-primary outline-none placeholder:font-normal placeholder:text-foreground/25';
/** The quiet fields in Field: a sunk plate (FIELD_PLATE) in small mono instead of the underlined line. */
const FIELD_QUIET = 'field:py-1.5 field:text-xs field:font-normal field:placeholder:text-muted-foreground/70';
/** An example sentence in Field: mono, but too long for capitals. */
const FIELD_EXAMPLE = 'field:rounded-[3px] field:font-mono field:text-[10.5px]';

function QuietLine({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint: string; children: ReactNode }) {
  return (
    <div className="group/line contents">
      <label htmlFor={htmlFor} className="flex items-baseline gap-2 pt-1 field:pt-2">
        <span className="text-sm font-medium field:cap">{label}</span>
        <span className="text-xs text-muted-foreground field:cap">{hint}</span>
      </label>
      <div className="relative min-w-0 pb-1.5">
        {children}
        {/* The plate in Field has no hairline. */}
        <span className="absolute inset-x-0 bottom-0 h-px bg-border/70 transition-colors duration-300 group-focus-within/line:bg-primary/70 field:hidden" />
      </div>
    </div>
  );
}

/** The search kinds that came before, for when you know exactly where to look. */
function OtherWays() {
  const ways: { label: string; icon: typeof Globe; kind: string }[] = [
    { label: 'Start from your website', icon: Globe, kind: 'website' },
    { label: 'Local businesses', icon: MapPin, kind: 'local' },
    { label: 'Web search', icon: Globe, kind: 'web' },
    { label: 'New launches', icon: Rocket, kind: 'launches' },
    { label: 'Paste a list', icon: ClipboardList, kind: 'domains' },
  ];
  return (
    <section aria-labelledby="other-ways" className="mt-12">
      <h2 id="other-ways" className="text-sm text-muted-foreground field:cap">
        Other ways to search
      </h2>
      <div className="mt-2 -ml-3 flex flex-wrap gap-1">
        {ways.map(({ label, icon: Icon, kind }) => (
          <Pill key={kind} onClick={() => navigate({ name: 'new', kind })} className="inline-flex items-center gap-1.5 field:cap field:rounded-[3px]">
            <Icon className="size-3" />
            {label}
            <ArrowRight className="size-3 opacity-50" />
          </Pill>
        ))}
      </div>
    </section>
  );
}
