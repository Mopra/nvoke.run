'use client';

import type { Dispatch, Ref, RefObject, SetStateAction } from 'react';
import { ChevronDown } from 'lucide-react';
import { itemDomain } from '@nvoke/shared';
import { CountryPicker } from '@/components/app/country-picker';
import { Line, Pill, SENTENCE, SentenceInput } from '@/components/app/sentence';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatNumber, WINDOW_LABEL, type LaunchWindow } from '@/lib/app/desktop';
import { LIMIT_PRESETS, summarizeList, type SearchForm } from '@/lib/app/search-form';
import { cn } from '@/lib/utils';

/**
 * The fields of a search written as a sentence ("Find dentists in Austin up
 * to 100 companies"), for the form's kind. New search uses it, and so does
 * Search more on a results page, where `more` makes the limit read as
 * "more companies" and a list as "Add".
 */
export function SearchFields({
  form,
  onChange,
  touched,
  maxLimit,
  firstField,
  listField,
  more = false,
  className,
}: {
  form: SearchForm;
  onChange: Dispatch<SetStateAction<SearchForm>>;
  /** After a submit, empty required fields show as invalid. */
  touched: boolean;
  maxLimit: number;
  firstField?: RefObject<HTMLInputElement | null>;
  listField?: RefObject<HTMLTextAreaElement | null>;
  more?: boolean;
  className?: string;
}) {
  const set = <K extends keyof SearchForm>(key: K) => (value: SearchForm[K]) => onChange((f) => ({ ...f, [key]: value }));
  const list = summarizeList(form.list, maxLimit);
  const invalid = (value: string): boolean => touched && !value.trim();
  const preset = LIMIT_PRESETS.find((p) => p === form.limit) ?? null;

  return (
    <div className={cn('grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-3 sm:gap-x-6', className)}>
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
          <Line lead={more ? 'Add' : 'Contacts at'} htmlFor="list">
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
                {more ? 'more companies' : 'companies'}
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
      onKeyDown={(e) => {
        // Enter is a new line here, so Ctrl or Cmd with Enter starts the search.
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          e.currentTarget.form?.requestSubmit();
        }
      }}
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
              <span key={item} title={domain ?? item} className={cn('max-w-48 truncate rounded-full bg-foreground/[0.05] px-2.5 py-0.5', domain && 'font-mono')}>
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
