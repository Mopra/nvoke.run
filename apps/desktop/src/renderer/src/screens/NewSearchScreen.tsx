import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ChevronsUpDown, CornerDownLeft, Globe, Loader2, MapPin, Rocket } from 'lucide-react';
import { toast } from 'sonner';
import { LargeTitle, PageHeader } from '@/components/AppShell';
import { FieldRow, Group, Row } from '@/components/grouped';
import { Button } from '@/components/ui/button';
import { PlainInput } from '@/components/ui/input';
import { Segmented } from '@/components/ui/segmented';
import { formatNumber, searchTitle, WINDOW_LABEL } from '@/lib/format';
import { useCreateSearch, useMe } from '@/lib/queries';
import { navigate } from '@/lib/router';
import type { LaunchWindow, SearchInput, SearchKind } from '@/lib/types';
import { useScrolled } from '@/lib/use-scrolled';

const LIMIT_PRESETS = ['25', '100', '250', '500'] as const;
const MAX_LIMIT = 1000;

const COUNTRIES: [string, string][] = [
  ['', 'Any country'],
  ['DK', 'Denmark'],
  ['SE', 'Sweden'],
  ['NO', 'Norway'],
  ['FI', 'Finland'],
  ['DE', 'Germany'],
  ['NL', 'Netherlands'],
  ['GB', 'United Kingdom'],
  ['IE', 'Ireland'],
  ['FR', 'France'],
  ['ES', 'Spain'],
  ['IT', 'Italy'],
  ['US', 'United States'],
  ['CA', 'Canada'],
  ['AU', 'Australia'],
];

const SOURCES: Record<SearchKind, string> = {
  local: 'Businesses on OpenStreetMap that list a website, inside the area you name.',
  web: 'Company websites from web search results. Social networks, marketplaces and news sites are left out.',
  launches: 'Products launched recently on Product Hunt and Show HN.',
};

function isKind(value: string | null): value is SearchKind {
  return value === 'local' || value === 'web' || value === 'launches';
}

export function NewSearchScreen({ initialKind }: { initialKind: string | null }) {
  const [kind, setKind] = useState<SearchKind>(isKind(initialKind) ? initialKind : 'local');
  const [niche, setNiche] = useState('');
  const [location, setLocation] = useState('');
  const [keyword, setKeyword] = useState('');
  const [country, setCountry] = useState('');
  const [launchKeyword, setLaunchKeyword] = useState('');
  const [launchWindow, setLaunchWindow] = useState<LaunchWindow>('week');
  const [limit, setLimit] = useState(100);
  const [touched, setTouched] = useState(false);
  const firstField = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLElement>(null);
  const scrolled = useScrolled(scrollRef);
  const create = useCreateSearch();
  const me = useMe();

  useEffect(() => {
    firstField.current?.focus();
  }, [kind]);

  function buildInput(): SearchInput | null {
    const lim = Math.min(MAX_LIMIT, Math.max(1, Math.round(limit) || 100));
    if (kind === 'local') {
      if (!niche.trim() || !location.trim()) return null;
      return { kind, params: { niche: niche.trim(), location: location.trim() }, limit: lim };
    }
    if (kind === 'web') {
      if (!keyword.trim()) return null;
      return { kind, params: { keyword: keyword.trim(), ...(country ? { country } : {}) }, limit: lim };
    }
    const k = launchKeyword.trim();
    return { kind, params: { window: launchWindow, ...(k ? { keyword: k } : {}) }, limit: lim };
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
      onError: (err) => toast.error('Could not start the search', { description: err.message }),
    });
  }

  const invalid = (value: string): boolean => touched && !value.trim();
  const remaining = me.data ? me.data.usage.limit - me.data.usage.emailsFound : null;
  const preset = LIMIT_PRESETS.find((p) => Number(p) === limit) ?? null;

  return (
    <>
      <PageHeader title="New search" divider={scrolled} titleHidden={!scrolled} />
      <main ref={scrollRef} className="flex-1 overflow-auto px-6 pb-10">
        <form
          onSubmit={submit}
          className="mx-auto flex max-w-[560px] flex-col gap-7 motion-safe:animate-page-in"
          noValidate
        >
          <LargeTitle className="-mb-2 px-0.5" subtitle="Tell nvoke where to look. Results arrive while it works.">
            New search
          </LargeTitle>
          <div className="flex flex-col gap-2.5">
            <Segmented
              label="Where to look"
              value={kind}
              onChange={setKind}
              stretch
              options={[
                { value: 'local', label: 'Local businesses', icon: MapPin },
                { value: 'web', label: 'Web search', icon: Globe },
                { value: 'launches', label: 'New launches', icon: Rocket },
              ]}
            />
            <p className="px-3.5 text-xs text-muted-foreground">{SOURCES[kind]}</p>
          </div>

          {kind === 'local' && (
            <Group footer="Plural works best, for example dentists or bakeries. Where can be a city, region or postcode.">
              <FieldRow label="Kind of business" htmlFor="niche">
                <PlainInput
                  id="niche"
                  ref={firstField}
                  value={niche}
                  onChange={(e) => setNiche(e.target.value)}
                  placeholder="Dentists"
                  aria-invalid={invalid(niche)}
                />
              </FieldRow>
              <FieldRow label="Where" htmlFor="location">
                <PlainInput
                  id="location"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Copenhagen"
                  aria-invalid={invalid(location)}
                />
              </FieldRow>
            </Group>
          )}

          {kind === 'web' && (
            <Group footer="Describe what the companies do or sell.">
              <FieldRow label="Keyword" htmlFor="keyword">
                <PlainInput
                  id="keyword"
                  ref={firstField}
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  placeholder="Headless CMS"
                  aria-invalid={invalid(keyword)}
                />
              </FieldRow>
              <FieldRow label="Country" htmlFor="country">
                <div className="relative">
                  <select
                    id="country"
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    className="h-8 w-full appearance-none rounded-sm bg-transparent pr-8 pl-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/25"
                  >
                    {COUNTRIES.map(([code, name]) => (
                      <option key={code} value={code}>
                        {name}
                      </option>
                    ))}
                  </select>
                  <ChevronsUpDown className="pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                </div>
              </FieldRow>
            </Group>
          )}

          {kind === 'launches' && (
            <Group footer="Leave the keyword empty to see every launch.">
              <FieldRow label="Keyword" htmlFor="launch-keyword">
                <PlainInput
                  id="launch-keyword"
                  ref={firstField}
                  value={launchKeyword}
                  onChange={(e) => setLaunchKeyword(e.target.value)}
                  placeholder="Optional, for example analytics"
                />
              </FieldRow>
              <Row label="Launched in the">
                <Segmented
                  label="Time window"
                  size="sm"
                  value={launchWindow}
                  onChange={setLaunchWindow}
                  options={(Object.keys(WINDOW_LABEL) as LaunchWindow[]).map((w) => ({
                    value: w,
                    label: WINDOW_LABEL[w].replace('Last ', 'last '),
                  }))}
                />
              </Row>
            </Group>
          )}

          <Group
            footer={
              <>
                Only emails count toward your plan.
                {remaining !== null && ` You have ${formatNumber(Math.max(0, remaining))} left this month.`}
              </>
            }
          >
            <Row label="Companies to find" htmlFor="limit">
              <Segmented
                label="Preset limits"
                size="sm"
                value={preset ?? ('' as (typeof LIMIT_PRESETS)[number])}
                onChange={(v) => setLimit(Number(v))}
                options={LIMIT_PRESETS.map((p) => ({ value: p, label: <span className="tabular-nums">{p}</span> }))}
              />
              <PlainInput
                id="limit"
                type="number"
                min={1}
                max={MAX_LIMIT}
                value={Number.isNaN(limit) ? '' : limit}
                onChange={(e) => setLimit(e.target.valueAsNumber)}
                aria-label="Custom limit"
                className="h-7 w-16 rounded-[7px] bg-foreground/[0.06] text-center tabular-nums"
              />
            </Row>
          </Group>

          <div className="flex items-center justify-end gap-2">
            {touched && !input && <span className="mr-auto text-sm text-destructive">Fill in the highlighted fields.</span>}
            <Button type="button" variant="ghost" onClick={() => navigate({ name: 'searches' })}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending} className="min-w-32">
              {create.isPending ? <Loader2 className="motion-safe:animate-spin" /> : null}
              Start search
              {!create.isPending && <CornerDownLeft className="size-3.5 opacity-70" />}
            </Button>
          </div>
        </form>
      </main>
    </>
  );
}
