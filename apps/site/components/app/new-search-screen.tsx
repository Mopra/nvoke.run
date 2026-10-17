'use client';

import { useEffect, useRef, useState, type FormEvent, type Ref } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowUpRight, ChevronDown, ClipboardList, CornerDownLeft, Globe, Loader2, MapPin, Rocket, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { itemDomain, SEARCH_LIMIT_MAX, type CreateSearchInput } from '@nvoke/shared';
import { CountryPicker } from '@/components/app/country-picker';
import { Line, Pill, SENTENCE, SentenceInput } from '@/components/app/sentence';
import { APP_COLUMN, APP_FRAME, APP_INSET, BackLink } from '@/components/app/shell';
import { Button } from '@/components/ui/button';
import { Segmented } from '@/components/ui/segmented';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { isQuotaError } from '@/lib/app/api';
import { formatNumber, searchTitle, WINDOW_LABEL, type LaunchWindow } from '@/lib/app/desktop';
import { BILLING_PATH, quotaState } from '@/lib/app/quota';
import { useCreateSearch, useMe } from '@/lib/app/queries';
import { WEBSITE_PATH } from '@/lib/app/site-profile';
import {
  buildSearchInput,
  emptyForm,
  formProblem,
  LIMIT_PRESETS,
  summarizeList,
  type FormKind,
  type SearchForm,
} from '@/lib/app/search-form';
import { cn } from '@/lib/utils';

const SOURCES: Record<FormKind, string> = {
  local: 'Businesses on OpenStreetMap with a website, inside the area you name.',
  web: 'Company sites from web search. No social networks, marketplaces or news.',
  launches: 'Fresh launches from Product Hunt and Show HN.',
  domains: 'Companies you already know. Domains are read as given, names are looked up on the web.',
};

/**
 * Starts a search the way the form does: the same mutation and cache updates,
 * a toast, then the search's page. Suggestions from the website step use it too.
 */
export function useStartSearch() {
  const router = useRouter();
  const create = useCreateSearch();
  const start = (input: CreateSearchInput): void => {
    if (create.isPending) return;
    create.mutate(input, {
      onSuccess: (search) => {
        toast.success('Search started', { description: searchTitle(search) });
        router.replace(`/app/searches/${search.id}`);
      },
      onError: (err) => {
        if (isQuotaError(err)) {
          toast.error('This month’s verified emails are used up', {
            description: 'Upgrade to keep searching now, or wait for the reset.',
            action: { label: 'Upgrade', onClick: () => router.push(BILLING_PATH) },
          });
          return;
        }
        toast.error('Couldn’t start the search', { description: err.message });
      },
    });
  };
  return { start, isPending: create.isPending, pendingInput: create.isPending ? create.variables : undefined };
}

export function NewSearchScreen({ initialKind }: { initialKind: FormKind }) {
  const [form, setForm] = useState<SearchForm>(() => emptyForm(initialKind));
  const [touched, setTouched] = useState(false);
  const firstField = useRef<HTMLInputElement>(null);
  const listField = useRef<HTMLTextAreaElement>(null);
  const create = useStartSearch();
  const me = useMe();

  const set = <K extends keyof SearchForm>(key: K) => (value: SearchForm[K]) => setForm((f) => ({ ...f, [key]: value }));

  useEffect(() => {
    (form.kind === 'domains' ? listField.current : firstField.current)?.focus();
  }, [form.kind]);

  // The plan caps one search; the server clamps too, this keeps the form honest.
  const maxLimit = me.data?.maxSearchLimit ?? SEARCH_LIMIT_MAX;
  const list = summarizeList(form.list, maxLimit);
  const input = buildSearchInput(form, maxLimit);
  const quota = me.data ? quotaState(me.data) : null;

  function submit(event?: FormEvent): void {
    event?.preventDefault();
    setTouched(true);
    if (!input) return;
    create.start(input);
  }

  const invalid = (value: string): boolean => touched && !value.trim();
  const preset = LIMIT_PRESETS.find((p) => p === form.limit) ?? null;
  const problem = touched ? formProblem(form, maxLimit) : null;

  return (
    <main className={cn(APP_FRAME, 'pb-24')}>
      <form onSubmit={submit} className={cn(APP_INSET, APP_COLUMN, 'flex flex-col pt-8 motion-safe:animate-rise sm:pt-[6vh]')} noValidate>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <BackLink />
          <Link
            href={WEBSITE_PATH}
            className="-mr-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40"
          >
            <Sparkles className="size-3.5" />
            Plan from your website
          </Link>
        </div>
        <h1 className="sr-only">New search</h1>
        <div className="mt-6 flex flex-col items-start gap-3">
          <div className="max-w-full overflow-x-auto pb-1">
            <Segmented
              label="Where to look"
              value={form.kind}
              onChange={set('kind')}
              options={[
                { value: 'local', label: 'Local businesses', icon: MapPin },
                { value: 'web', label: 'Web search', icon: Globe },
                { value: 'launches', label: 'New launches', icon: Rocket },
                { value: 'domains', label: 'Paste a list', icon: ClipboardList },
              ]}
            />
          </div>
          <p className="pl-1 text-sm text-muted-foreground">{SOURCES[form.kind]}</p>
        </div>

        <div className="mt-12 grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-3 sm:gap-x-6">
          {form.kind === 'local' && (
            <>
              <Line lead="Find" htmlFor="niche">
                <SentenceInput
                  id="niche"
                  ref={firstField}
                  value={form.niche}
                  onChange={(e) => set('niche')(e.target.value)}
                  placeholder="dentists"
                  aria-invalid={invalid(form.niche)}
                />
              </Line>
              <Line lead="in" htmlFor="location">
                <SentenceInput
                  id="location"
                  value={form.location}
                  onChange={(e) => set('location')(e.target.value)}
                  placeholder="Austin"
                  aria-invalid={invalid(form.location)}
                />
              </Line>
            </>
          )}

          {form.kind === 'web' && (
            <>
              <Line lead="Find" htmlFor="keyword">
                <SentenceInput
                  id="keyword"
                  ref={firstField}
                  value={form.keyword}
                  onChange={(e) => set('keyword')(e.target.value)}
                  placeholder="headless CMS"
                  aria-invalid={invalid(form.keyword)}
                />
              </Line>
              <Line lead="in" htmlFor="country">
                <CountryPicker id="country" value={form.country} onChange={set('country')} triggerClassName={SENTENCE} />
              </Line>
            </>
          )}

          {form.kind === 'launches' && (
            <>
              <Line lead="Find" htmlFor="launch-keyword">
                <SentenceInput
                  id="launch-keyword"
                  ref={firstField}
                  value={form.launchKeyword}
                  onChange={(e) => set('launchKeyword')(e.target.value)}
                  placeholder="any launch"
                />
              </Line>
              <Line lead="from the" htmlFor="launch-window">
                <SentenceSelect
                  id="launch-window"
                  value={form.launchWindow}
                  onChange={(v) => set('launchWindow')(v as LaunchWindow)}
                  options={(Object.keys(WINDOW_LABEL) as LaunchWindow[]).map((w) => [w, WINDOW_LABEL[w].toLowerCase()])}
                />
              </Line>
            </>
          )}

          {form.kind === 'domains' && (
            <>
              <Line lead="Contacts at" htmlFor="list">
                <ListField
                  id="list"
                  ref={listField}
                  value={form.list}
                  onChange={set('list')}
                  invalid={touched && (list.items.length === 0 || list.tooLong)}
                />
              </Line>
              <ListSummary items={list.items} domains={list.domains} names={list.names} max={maxLimit} />
              {list.names > 0 && (
                <Line lead="names in" htmlFor="list-country">
                  <CountryPicker id="list-country" value={form.listCountry} onChange={set('listCountry')} triggerClassName={SENTENCE} />
                </Line>
              )}
            </>
          )}

          {form.kind !== 'domains' && (
            <>
              <Line lead="up to" htmlFor="limit">
                <div className="flex items-baseline gap-3 sm:gap-4">
                  <input
                    id="limit"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={maxLimit}
                    value={Number.isNaN(form.limit) ? '' : form.limit}
                    onChange={(e) => set('limit')(e.target.valueAsNumber)}
                    style={{ width: `${Math.max(2, String(Number.isNaN(form.limit) ? '' : form.limit).length) + 0.4}ch` }}
                    className={cn(SENTENCE, 'tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none')}
                  />
                  <span className="font-display text-[26px]/[34px] font-semibold tracking-[-0.03em] text-muted-foreground/50 sm:text-4xl">
                    companies
                  </span>
                </div>
              </Line>
              <div className="col-start-2 -mt-1 -ml-3 flex flex-wrap gap-1" role="group" aria-label="Preset limits">
                {LIMIT_PRESETS.map((p) => (
                  <Pill key={p} pressed={preset === p} onClick={() => set('limit')(p)}>
                    {p}
                  </Pill>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="mt-14 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:gap-6">
          <Button type="submit" size="lg" disabled={create.isPending} className="min-w-40">
            {create.isPending ? <Loader2 className="motion-safe:animate-spin" /> : null}
            Start search
            {!create.isPending && <CornerDownLeft className="size-3.5 opacity-70" />}
          </Button>
          {problem ? (
            <span className="text-sm text-destructive">{problem}</span>
          ) : quota?.level === 'out' ? (
            <p className="max-w-sm text-sm text-muted-foreground">
              This month’s {formatNumber(quota.limit)} verified emails are used, so a search stops at once.{' '}
              <Link href={BILLING_PATH} className="inline-flex items-center gap-0.5 text-primary hover:underline">
                Upgrade
                <ArrowUpRight className="size-3.5" />
              </Link>
            </p>
          ) : (
            <p className="max-w-sm text-xs text-muted-foreground">
              Only verified emails count.
              {quota && ` ${formatNumber(quota.left)} left this month.`}
              {me.data && form.kind !== 'domains' && form.limit > maxLimit && ` Max ${formatNumber(maxLimit)} companies per search.`}
              {' Checking each address with its mail server takes several minutes. Results are kept for 12 months.'}
            </p>
          )}
        </div>
      </form>
    </main>
  );
}

/** The pasted list in display type, growing with its lines up to a scroll. Monospace, since most of it is domains. */
function ListField({
  id,
  ref,
  value,
  onChange,
  invalid,
}: {
  id: string;
  ref: Ref<HTMLTextAreaElement>;
  value: string;
  onChange: (value: string) => void;
  invalid: boolean;
}) {
  const lines = Math.min(8, Math.max(3, value.split('\n').length));
  return (
    <textarea
      id={id}
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={lines}
      spellCheck={false}
      autoComplete="off"
      aria-invalid={invalid}
      aria-describedby="list-summary"
      placeholder={'acme.com\nhttps://linear.app\nNovo Nordisk'}
      className={cn(SENTENCE, 'block w-full resize-none overflow-y-auto font-mono text-lg/[1.45] font-normal tracking-tight sm:text-2xl/[1.45]')}
    />
  );
}

/** What the list holds, read back as the user types: domains against names, and the first few items. */
function ListSummary({ items, domains, names, max }: { items: string[]; domains: number; names: number; max: number }) {
  const shown = items.slice(0, 6);
  const parts = [
    domains > 0 && `${formatNumber(domains)} ${domains === 1 ? 'domain' : 'domains'}`,
    names > 0 && `${formatNumber(names)} ${names === 1 ? 'name' : 'names'} to look up`,
  ].filter(Boolean);
  return (
    <div
      id="list-summary"
      aria-live="polite"
      className="col-start-2 -mt-1 mb-4 flex min-h-7 flex-wrap items-center gap-x-2 gap-y-1.5 text-xs text-muted-foreground"
    >
      {items.length === 0 ? (
        <span>One per line: domains, websites, email addresses or company names. Up to {formatNumber(max)}.</span>
      ) : (
        <>
          <span className={cn('mr-1 tabular-nums', items.length > max ? 'text-destructive' : 'text-foreground')}>
            {items.length > max ? `More than ${formatNumber(max)}` : parts.join(', ')}
          </span>
          {shown.map((item) => {
            const domain = itemDomain(item);
            return (
              <span key={item} className={cn('max-w-48 truncate rounded-full bg-foreground/[0.05] px-2.5 py-0.5', domain && 'font-mono')}>
                {domain ?? item}
              </span>
            );
          })}
          {items.length > shown.length && items.length <= max && <span>and {formatNumber(items.length - shown.length)} more</span>}
        </>
      )}
    </div>
  );
}

const ANY = 'any';

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
