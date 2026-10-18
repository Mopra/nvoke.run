import { useState, type Ref } from 'react';
import { ArrowRight, ChevronDown } from 'lucide-react';
import { CountryPicker } from '@/components/CountryPicker';
import { Line, Pill, SENTENCE, SentenceInput } from '@/components/Sentence';
import { Knob } from '@/components/ui/knob';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { itemDomain, SEARCH_LIMIT_MAX, splitList } from '@nvoke/shared';
import { formatNumber, WINDOW_DAYS, WINDOW_LABEL, type LaunchWindow } from '@/lib/format';
import { useMe } from '@/lib/queries';
import { navigate } from '@/lib/router';
import type { Search, SearchInput, SearchKind } from '@/lib/types';
import { cn } from '@/lib/utils';

/** Drop searches come from drops, never from this form. Describe your customer (`icp`) has a form of its own. */
export type FormKind = Exclude<SearchKind, 'drop' | 'icp'>;

/** The limit's detents: the knob's ticks on New search, a row of keycaps elsewhere. */
const LIMIT_PRESETS: number[] = [25, 100, 250, 500];

/** A recessed plate for pasted text: mono on the card color, sunk into the chassis. */
export const PLATE = 'rounded-[4px] bg-card px-3 py-2 font-mono shadow-[inset_0_1px_2px_var(--shadow-strong)]';
/** Small print under a key: mono, with the figure that matters in orange. */
export const NOTE = 'font-mono text-[10.5px] leading-[1.6] text-muted-foreground';

export function isFormKind(value: string | null): value is FormKind {
  return value === 'local' || value === 'web' || value === 'launches' || value === 'domains';
}

/** The window a number of days falls in, for params a search already ran with. */
function windowOf(days: number | undefined): LaunchWindow {
  return (Object.keys(WINDOW_DAYS) as LaunchWindow[]).find((w) => WINDOW_DAYS[w] === days) ?? 'week';
}

/**
 * The search sentence as state: every kind's words, the limit, and the
 * request they make (null while a needed word is missing). `start` fills it
 * from params a search already ran with, except a list, which starts empty
 * so the user pastes what is new.
 */
export function useSearchForm(kind: FormKind, start?: { params: Search['params']; limit: number }) {
  const p = (start?.params ?? {}) as Record<string, unknown>;
  const str = (key: string): string => (typeof p[key] === 'string' ? (p[key] as string) : '');
  const [niche, setNiche] = useState(kind === 'local' ? str('niche') : '');
  const [location, setLocation] = useState(kind === 'local' ? str('location') : '');
  const [keyword, setKeyword] = useState(kind === 'web' ? str('keyword') : '');
  const [country, setCountry] = useState(kind === 'web' ? str('country') : '');
  const [launchKeyword, setLaunchKeyword] = useState(kind === 'launches' ? str('keyword') : '');
  const [launchWindow, setLaunchWindow] = useState<LaunchWindow>(kind === 'launches' ? windowOf(p['days'] as number | undefined) : 'week');
  const [list, setList] = useState('');
  const [listCountry, setListCountry] = useState(kind === 'domains' ? str('country') : '');
  const [limit, setLimit] = useState(kind !== 'domains' && start ? start.limit : 100);
  const [touched, setTouched] = useState(false);
  const me = useMe();

  // The plan caps one search; the server clamps too, this just keeps the form honest.
  const maxLimit = me.data?.maxSearchLimit ?? SEARCH_LIMIT_MAX;
  // One more than fits, so the form can say the list is too long.
  const items = splitList(list, maxLimit + 1);
  const tooLong = items.length > maxLimit;
  const domainCount = items.filter((item) => itemDomain(item) !== null).length;
  const nameCount = items.length - domainCount;

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
    if (kind === 'domains') {
      if (items.length === 0 || tooLong) return null;
      return { kind, params: { items, ...(listCountry && nameCount > 0 ? { country: listCountry } : {}) } };
    }
    const k = launchKeyword.trim();
    return { kind, params: { days: WINDOW_DAYS[launchWindow], ...(k ? { keyword: k } : {}) }, limit: lim };
  }

  const input = buildInput();
  const problem = !touched || input
    ? null
    : kind !== 'domains'
      ? 'Fill in the highlighted words.'
      : tooLong
        ? `Up to ${formatNumber(maxLimit)} companies in one list.`
        : 'Paste a domain or a company name per line.';

  return {
    kind,
    values: { niche, location, keyword, country, launchKeyword, launchWindow, list, listCountry, limit },
    set: { setNiche, setLocation, setKeyword, setCountry, setLaunchKeyword, setLaunchWindow, setList, setListCountry, setLimit },
    items,
    tooLong,
    domainCount,
    nameCount,
    maxLimit,
    touched,
    setTouched,
    input,
    problem,
    me,
  };
}

export type SearchForm = ReturnType<typeof useSearchForm>;

/**
 * The sentence's lines for the form's kind, in the two column grid of
 * `Line`. `more` words it as another run of a search: the limit counts new
 * companies and there is no daily drop offer. `presets` is the row of limit
 * keycaps under the sentence; New search turns it off and shows the knob.
 */
export function SearchFields({
  form,
  firstField,
  listField,
  more = false,
  presets = true,
}: {
  form: SearchForm;
  firstField?: Ref<HTMLInputElement>;
  listField?: Ref<HTMLTextAreaElement>;
  more?: boolean;
  presets?: boolean;
}) {
  const { kind, values: v, set, touched, items, tooLong, maxLimit } = form;
  const invalid = (value: string): boolean => touched && !value.trim();

  return (
    <div className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-6 gap-y-3">
      {kind === 'local' && (
        <>
          <Line lead="Find" htmlFor="niche">
            <SentenceInput
              id="niche"
              ref={firstField}
              value={v.niche}
              onChange={(e) => set.setNiche(e.target.value)}
              placeholder="dentists"
              aria-invalid={invalid(v.niche)}
            />
          </Line>
          <Line lead="in" htmlFor="location">
            <SentenceInput
              id="location"
              value={v.location}
              onChange={(e) => set.setLocation(e.target.value)}
              placeholder="Austin"
              aria-invalid={invalid(v.location)}
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
              value={v.keyword}
              onChange={(e) => set.setKeyword(e.target.value)}
              placeholder="headless CMS"
              aria-invalid={invalid(v.keyword)}
            />
          </Line>
          <Line lead="in" htmlFor="country">
            <CountryPicker id="country" value={v.country} onChange={set.setCountry} triggerClassName={SENTENCE} />
          </Line>
        </>
      )}

      {kind === 'launches' && (
        <>
          <Line lead="Find" htmlFor="launch-keyword">
            <SentenceInput
              id="launch-keyword"
              ref={firstField}
              value={v.launchKeyword}
              onChange={(e) => set.setLaunchKeyword(e.target.value)}
              placeholder="any launch"
            />
          </Line>
          <Line lead="from the" htmlFor="launch-window">
            <SentenceSelect
              id="launch-window"
              value={v.launchWindow}
              onChange={(value) => set.setLaunchWindow(value as LaunchWindow)}
              options={(Object.keys(WINDOW_LABEL) as LaunchWindow[]).map((w) => [w, WINDOW_LABEL[w].toLowerCase()])}
            />
          </Line>
          {!more && (
            <div className="col-start-2 mt-1 mb-4">
              <Pill onClick={() => navigate({ name: 'drop', id: null, keyword: v.launchKeyword.trim() || null })}>
                Get the new ones every day
                <ArrowRight className="size-3" />
              </Pill>
            </div>
          )}
        </>
      )}

      {kind === 'domains' && (
        <>
          <Line lead={more ? 'Add contacts at' : 'Contacts at'} htmlFor="list">
            <ListField
              id="list"
              ref={listField}
              value={v.list}
              onChange={set.setList}
              invalid={touched && (items.length === 0 || tooLong)}
            />
          </Line>
          <ListSummary items={items} domains={form.domainCount} names={form.nameCount} max={maxLimit} />
          {form.nameCount > 0 && (
            <Line lead="names in" htmlFor="list-country">
              <CountryPicker id="list-country" value={v.listCountry} onChange={set.setListCountry} triggerClassName={SENTENCE} />
            </Line>
          )}
        </>
      )}

      {kind !== 'domains' && (
        <>
          <Line lead="up to" htmlFor="limit">
            <div className="flex items-baseline gap-4">
              <input
                id="limit"
                type="number"
                min={1}
                max={maxLimit}
                value={Number.isNaN(v.limit) ? '' : v.limit}
                onChange={(e) => set.setLimit(e.target.valueAsNumber)}
                style={{ width: `${Math.max(2, String(Number.isNaN(v.limit) ? '' : v.limit).length) + 0.4}ch` }}
                className={cn(SENTENCE, 'tabular-nums [&::-webkit-inner-spin-button]:appearance-none')}
              />
              <span className="font-display text-4xl font-light text-muted-foreground">{more ? 'more' : 'companies'}</span>
            </div>
          </Line>
          {presets && (
            <div className="col-start-2 mt-1 flex gap-2" role="group" aria-label="Preset limits">
              {LIMIT_PRESETS.map((p) => (
                <Pill key={p} pressed={p === v.limit} onClick={() => set.setLimit(p)}>
                  {p}
                </Pill>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/**
 * The limit as a knob with the presets as its ticks, under a bracketed LIMIT
 * label. It follows the typed limit when that is a preset, and points at the
 * nearest one otherwise; turning it writes the preset back into the sentence.
 */
export function LimitKnob({ form }: { form: SearchForm }) {
  const { values, set } = form;
  const typed = Number.isNaN(values.limit) ? 0 : values.limit;
  const nearest = LIMIT_PRESETS.reduce((best, p) => (Math.abs(p - typed) < Math.abs(best - typed) ? p : best));
  return (
    <div className="flex flex-col items-center gap-3.5">
      <Bracket label="Limit" />
      <Knob value={nearest} options={LIMIT_PRESETS} onChange={set.setLimit} label="Limit" format={formatNumber} size={170} />
      <div className="flex items-center gap-2">
        <span aria-hidden className="led led-on" />
        <span className="cap text-muted-foreground">Turn or click</span>
      </div>
    </div>
  );
}

/** A panel label over a bracket: the cap sits in a gap in the bracket's top line. */
function Bracket({ label }: { label: string }) {
  return (
    <div aria-hidden className="relative h-3.5 w-[150px]">
      <span className="absolute inset-x-1 top-0.5 h-1.5 border border-b-0 border-muted-foreground" />
      <span className="cap absolute -top-1 left-1/2 -translate-x-1/2 bg-background px-1.5 text-muted-foreground">{label}</span>
    </div>
  );
}

/** The line under the submit button: what is wrong, or what a search costs. */
export function SearchFootnote({ form }: { form: SearchForm }) {
  const { me, kind, values, maxLimit, problem } = form;
  if (problem) return <span className="font-mono text-[10.5px] text-destructive">{problem}</span>;
  const remaining = me.data ? me.data.usage.emailsLimit - me.data.usage.emailsVerified : null;
  return (
    <p className={cn('max-w-sm', NOTE)}>
      Only verified emails count.
      {remaining !== null && (
        <>
          {' '}
          <span className="font-medium text-primary">{formatNumber(Math.max(0, remaining))}</span> left this month.
        </>
      )}
      {me.data && kind !== 'domains' && values.limit > maxLimit && ` Max ${formatNumber(maxLimit)} companies per search.`}
      {' Results are kept for 12 months.'}
    </p>
  );
}

/**
 * The pasted list on a recessed plate, growing with its lines up to a scroll.
 * Monospace, since most of what lands here is domains.
 */
function ListField({
  id,
  ref,
  value,
  onChange,
  invalid,
}: {
  id: string;
  ref?: Ref<HTMLTextAreaElement>;
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
      placeholder={'acme.com\nhttps://linear.app\nStripe'}
      className={cn(SENTENCE, 'block w-full resize-none overflow-y-auto text-lg leading-[1.45] font-normal tracking-tight', PLATE)}
    />
  );
}

/** What the list holds, read back as the user types: the split between domains and names, and the first few items. */
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
      className="col-start-2 -mt-1 mb-4 flex min-h-7 flex-wrap items-center gap-x-2 gap-y-1.5 font-mono text-[10.5px] text-muted-foreground"
    >
      {items.length === 0 ? (
        <span>One per line: domains, websites, email addresses or company names. Up to {formatNumber(max)}.</span>
      ) : (
        <>
          <span className={cn('mr-1 tabular-nums', items.length > max ? 'text-destructive' : 'text-foreground')}>
            {items.length > max ? `More than ${formatNumber(max)}` : parts.join(', ')}
          </span>
          {shown.map((item) => (
            <span
              key={item}
              title={item}
              className="max-w-48 truncate rounded-[3px] bg-secondary px-2 py-0.5 text-secondary-foreground shadow-[0_1px_0_var(--glass-edge)]"
            >
              {itemDomain(item) ?? item}
            </span>
          ))}
          {items.length > shown.length && items.length <= max && <span>and {formatNumber(items.length - shown.length)} more</span>}
        </>
      )}
    </div>
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
