import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, ChevronDown, CornerDownLeft, Globe, Loader2, MapPin, Rocket } from 'lucide-react';
import { toast } from 'sonner';
import { BackButton, PageHeader } from '@/components/AppShell';
import { Button } from '@/components/ui/button';
import { Segmented } from '@/components/ui/segmented';
import { CountryPicker } from '@/components/CountryPicker';
import { Line, Pill, SENTENCE, SentenceInput } from '@/components/Sentence';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SEARCH_LIMIT_MAX } from '@nvoke/shared';
import { formatNumber, searchTitle, WINDOW_DAYS, WINDOW_LABEL, type LaunchWindow } from '@/lib/format';
import { useCreateSearch, useMe } from '@/lib/queries';
import { navigate } from '@/lib/router';
import type { SearchInput, SearchKind } from '@/lib/types';
import { cn } from '@/lib/utils';

const LIMIT_PRESETS = ['25', '100', '250', '500'] as const;

/** Drop searches come from drops, never from this form. */
type FormKind = Exclude<SearchKind, 'drop'>;

const SOURCES: Record<FormKind, string> = {
  local: 'Businesses on OpenStreetMap with a website, inside the area you name.',
  web: 'Company sites from web search. No social networks, marketplaces or news.',
  launches: 'Fresh launches from Product Hunt and Show HN.',
};

function isKind(value: string | null): value is FormKind {
  return value === 'local' || value === 'web' || value === 'launches';
}

export function NewSearchScreen({ initialKind }: { initialKind: string | null }) {
  const [kind, setKind] = useState<FormKind>(isKind(initialKind) ? initialKind : 'local');
  const [niche, setNiche] = useState('');
  const [location, setLocation] = useState('');
  const [keyword, setKeyword] = useState('');
  const [country, setCountry] = useState('');
  const [launchKeyword, setLaunchKeyword] = useState('');
  const [launchWindow, setLaunchWindow] = useState<LaunchWindow>('week');
  const [limit, setLimit] = useState(100);
  const [touched, setTouched] = useState(false);
  const firstField = useRef<HTMLInputElement>(null);
  const create = useCreateSearch();
  const me = useMe();

  useEffect(() => {
    firstField.current?.focus();
  }, [kind]);

  // The plan caps one search; the server clamps too, this just keeps the form honest.
  const maxLimit = me.data?.maxSearchLimit ?? SEARCH_LIMIT_MAX;

  function buildInput(): SearchInput | null {
    const lim = Math.min(maxLimit, Math.max(1, Math.round(limit) || 100));
    if (kind === 'local') {
      if (!niche.trim() || !location.trim()) return null;
      return { kind, params: { niche: niche.trim(), location: location.trim() }, limit: lim };
    }
    if (kind === 'web') {
      if (!keyword.trim()) return null;
      return { kind, params: { keyword: keyword.trim(), ...(country ? { country } : {}) }, limit: lim };
    }
    const k = launchKeyword.trim();
    return { kind, params: { days: WINDOW_DAYS[launchWindow], ...(k ? { keyword: k } : {}) }, limit: lim };
  }

  const input = buildInput();

  function submit(event?: FormEvent): void {
    event?.preventDefault();
    setTouched(true);
    if (!input || create.isPending) return;
    create.mutate(input, {
      onSuccess: (search) => {
        toast.success('Search started', { description: searchTitle(search) });
        navigate({ name: 'search', id: search.id }, { replace: true });
      },
      onError: (err) => toast.error('Couldn’t start the search', { description: err.message }),
    });
  }

  const invalid = (value: string): boolean => touched && !value.trim();
  const remaining = me.data ? me.data.usage.emailsLimit - me.data.usage.emailsVerified : null;
  const preset = LIMIT_PRESETS.find((p) => Number(p) === limit) ?? null;

  return (
    <>
      <PageHeader leading={<BackButton />} newSearch={false} />
      <main className="fade-edges flex-1 overflow-auto px-8 pb-24">
        <form onSubmit={submit} className="mx-auto flex max-w-[760px] flex-col pt-[9vh] motion-safe:animate-rise" noValidate>
          <h1 className="sr-only">New search</h1>
          <div className="flex flex-col items-start gap-3">
            <Segmented
              label="Where to look"
              value={kind}
              onChange={setKind}
              options={[
                { value: 'local', label: 'Local businesses', icon: MapPin },
                { value: 'web', label: 'Web search', icon: Globe },
                { value: 'launches', label: 'New launches', icon: Rocket },
              ]}
            />
            <p className="pl-1 text-sm text-muted-foreground">{SOURCES[kind]}</p>
          </div>

          <div className="mt-14 grid grid-cols-[max-content_minmax(0,1fr)] gap-x-6 gap-y-3">
            {kind === 'local' && (
              <>
                <Line lead="Find" htmlFor="niche">
                  <SentenceInput
                    id="niche"
                    ref={firstField}
                    value={niche}
                    onChange={(e) => setNiche(e.target.value)}
                    placeholder="dentists"
                    aria-invalid={invalid(niche)}
                  />
                </Line>
                <Line lead="in" htmlFor="location">
                  <SentenceInput
                    id="location"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="Austin"
                    aria-invalid={invalid(location)}
                  />
                </Line>
              </>
            )}

            {kind === 'web' && (
              <>
                <Line lead="Find" htmlFor="keyword">
                  <SentenceInput
                    id="keyword"
                    ref={firstField}
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    placeholder="headless CMS"
                    aria-invalid={invalid(keyword)}
                  />
                </Line>
                <Line lead="in" htmlFor="country">
                  <CountryPicker id="country" value={country} onChange={setCountry} triggerClassName={SENTENCE} />
                </Line>
              </>
            )}

            {kind === 'launches' && (
              <>
                <Line lead="Find" htmlFor="launch-keyword">
                  <SentenceInput
                    id="launch-keyword"
                    ref={firstField}
                    value={launchKeyword}
                    onChange={(e) => setLaunchKeyword(e.target.value)}
                    placeholder="any launch"
                  />
                </Line>
                <Line lead="from the" htmlFor="launch-window">
                  <SentenceSelect
                    id="launch-window"
                    value={launchWindow}
                    onChange={(v) => setLaunchWindow(v as LaunchWindow)}
                    options={(Object.keys(WINDOW_LABEL) as LaunchWindow[]).map((w) => [w, WINDOW_LABEL[w].toLowerCase()])}
                  />
                </Line>
                <div className="col-start-2 -mt-1 -ml-3 mb-4">
                  <Pill
                    onClick={() => navigate({ name: 'drop', id: null, keyword: launchKeyword.trim() || null })}
                    className="inline-flex items-center gap-1.5"
                  >
                    Get the new ones every day
                    <ArrowRight className="size-3" />
                  </Pill>
                </div>
              </>
            )}

            <Line lead="up to" htmlFor="limit">
              <div className="flex items-baseline gap-4">
                <input
                  id="limit"
                  type="number"
                  min={1}
                  max={maxLimit}
                  value={Number.isNaN(limit) ? '' : limit}
                  onChange={(e) => setLimit(e.target.valueAsNumber)}
                  style={{ width: `${Math.max(2, String(Number.isNaN(limit) ? '' : limit).length) + 0.4}ch` }}
                  className={cn(SENTENCE, 'tabular-nums [&::-webkit-inner-spin-button]:appearance-none')}
                />
                <span className="font-display text-4xl font-semibold text-muted-foreground/50">companies</span>
              </div>
            </Line>
            <div className="col-start-2 -mt-1 -ml-3 flex gap-1" role="group" aria-label="Preset limits">
              {LIMIT_PRESETS.map((p) => (
                <Pill key={p} pressed={preset === p} onClick={() => setLimit(Number(p))}>
                  {p}
                </Pill>
              ))}
            </div>
          </div>

          <div className="mt-16 flex items-center gap-6">
            <Button type="submit" size="lg" disabled={create.isPending} className="min-w-40">
              {create.isPending ? <Loader2 className="motion-safe:animate-spin" /> : null}
              Start search
              {!create.isPending && <CornerDownLeft className="size-3.5 opacity-70" />}
            </Button>
            {touched && !input ? (
              <span className="text-sm text-destructive">Fill in the highlighted words.</span>
            ) : (
              <p className="max-w-sm text-xs text-muted-foreground">
                Only verified emails count.
                {remaining !== null && ` ${formatNumber(Math.max(0, remaining))} left this month.`}
                {me.data && limit > maxLimit && ` Max ${formatNumber(maxLimit)} companies per search.`}
                {' Results are kept for 12 months.'}
              </p>
            )}
          </div>
        </form>
      </main>
    </>
  );
}

function SentenceSelect({
  id,
  value,
  onChange,
  options,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: [string, string][];
}) {
  // Radix reserves the empty string for "no value", so "any" stands in for it.
  return (
    <Select value={value || ANY} onValueChange={(v) => onChange(v === ANY ? '' : v)}>
      <SelectTrigger id={id} className={cn(SENTENCE, 'w-full text-left')}>
        {/* Room for descenders: truncation clips to the line box at this size. */}
        <span className="min-w-0 flex-1 truncate py-[0.12em]">
          <SelectValue />
        </span>
        <ChevronDown className="size-6 shrink-0 text-muted-foreground/60" strokeWidth={1.75} />
      </SelectTrigger>
      <SelectContent align="start">
        {options.map(([code, name]) => (
          <SelectItem key={code || ANY} value={code || ANY} className="*:first-letter:uppercase">
            {name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const ANY = 'any';
