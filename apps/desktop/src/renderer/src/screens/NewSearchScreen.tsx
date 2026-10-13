import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Globe, Loader2, MapPin, Rocket } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/AppShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Kbd } from '@/components/ui/kbd';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { formatNumber, searchTitle, WINDOW_LABEL } from '@/lib/format';
import { useCreateSearch, useMe } from '@/lib/queries';
import { navigate } from '@/lib/router';
import type { LaunchWindow, SearchInput, SearchKind } from '@/lib/types';

const LIMIT_PRESETS = [25, 100, 250, 500];
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

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: [T, string][];
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex w-fit rounded-lg bg-muted p-[3px]">
      {options.map(([v, text]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={cn(
            'h-7 rounded-md px-3 text-sm font-medium outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50',
            value === v ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {text}
        </button>
      ))}
    </div>
  );
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

  return (
    <>
      <PageHeader title="New search" subtitle="Tell nvoke where to look. Results arrive while it works." />
      <main className="flex-1 overflow-auto px-6 py-8">
        <form onSubmit={submit} className="mx-auto flex max-w-xl flex-col gap-6" noValidate>
          <Tabs value={kind} onValueChange={(v) => isKind(v) && setKind(v)} className="gap-4">
            <TabsList className="w-full">
              <TabsTrigger value="local">
                <MapPin />
                Local businesses
              </TabsTrigger>
              <TabsTrigger value="web">
                <Globe />
                Web search
              </TabsTrigger>
              <TabsTrigger value="launches">
                <Rocket />
                New launches
              </TabsTrigger>
            </TabsList>
            <p className="text-sm text-muted-foreground">{SOURCES[kind]}</p>

            <div className="rounded-xl border bg-card p-5 shadow-xs">
              <TabsContent value="local" className="flex flex-col gap-5">
                <Field id="niche" label="What kind of business" hint="Plural works best, for example dentists or bakeries.">
                  <Input
                    id="niche"
                    ref={kind === 'local' ? firstField : undefined}
                    value={niche}
                    onChange={(e) => setNiche(e.target.value)}
                    placeholder="Dentists"
                    aria-invalid={invalid(niche)}
                  />
                </Field>
                <Field id="location" label="Where" hint="A city, region or postcode.">
                  <Input
                    id="location"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="Copenhagen"
                    aria-invalid={invalid(location)}
                  />
                </Field>
              </TabsContent>

              <TabsContent value="web" className="flex flex-col gap-5">
                <Field id="keyword" label="Keyword" hint="What the companies do or sell.">
                  <Input
                    id="keyword"
                    ref={kind === 'web' ? firstField : undefined}
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    placeholder="Headless CMS"
                    aria-invalid={invalid(keyword)}
                  />
                </Field>
                <Field id="country" label="Country">
                  <select
                    id="country"
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40"
                  >
                    {COUNTRIES.map(([code, name]) => (
                      <option key={code} value={code}>
                        {name}
                      </option>
                    ))}
                  </select>
                </Field>
              </TabsContent>

              <TabsContent value="launches" className="flex flex-col gap-5">
                <Field id="launch-keyword" label="Keyword" hint="Optional. Leave empty to see every launch.">
                  <Input
                    id="launch-keyword"
                    ref={kind === 'launches' ? firstField : undefined}
                    value={launchKeyword}
                    onChange={(e) => setLaunchKeyword(e.target.value)}
                    placeholder="AI, analytics, design..."
                  />
                </Field>
                <div className="flex flex-col gap-2">
                  <Label>Launched in the</Label>
                  <Segmented
                    label="Time window"
                    value={launchWindow}
                    onChange={setLaunchWindow}
                    options={(Object.keys(WINDOW_LABEL) as LaunchWindow[]).map((w) => [
                      w,
                      WINDOW_LABEL[w].replace('Last ', 'last '),
                    ])}
                  />
                </div>
              </TabsContent>

              <div className="mt-5 flex flex-col gap-2 border-t pt-5">
                <Label htmlFor="limit">Companies to find</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="limit"
                    type="number"
                    min={1}
                    max={MAX_LIMIT}
                    value={Number.isNaN(limit) ? '' : limit}
                    onChange={(e) => setLimit(e.target.valueAsNumber)}
                    className="w-24 tabular-nums"
                  />
                  <div className="flex gap-1">
                    {LIMIT_PRESETS.map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setLimit(p)}
                        className={cn(
                          'h-8 rounded-md px-2.5 text-sm tabular-nums outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50',
                          limit === p ? 'bg-secondary font-medium text-secondary-foreground' : 'text-muted-foreground hover:bg-accent',
                        )}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Only emails count toward your plan.
                  {remaining !== null && ` You have ${formatNumber(Math.max(0, remaining))} left this month.`}
                </p>
              </div>
            </div>
          </Tabs>

          <div className="flex items-center justify-end gap-3">
            {touched && !input && <span className="text-sm text-destructive">Fill in the highlighted fields.</span>}
            <Button type="button" variant="ghost" onClick={() => navigate({ name: 'searches' })}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending && <Loader2 className="animate-spin" />}
              Start search
              <Kbd className="ml-1 border-transparent bg-primary-foreground/15 text-primary-foreground/80">Enter</Kbd>
            </Button>
          </div>
        </form>
      </main>
    </>
  );
}
