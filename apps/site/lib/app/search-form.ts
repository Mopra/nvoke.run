import { itemDomain, SEARCH_LIMIT_MAX, splitList, type CreateSearchInput, type Search, type SearchKind } from '@nvoke/shared';
import { isActive, searchRuns, WINDOW_DAYS, type LaunchWindow } from './desktop';

/**
 * The new search form as data: what the fields hold, and the request they
 * make. The same rules as the desktop app's New search screen.
 */

/** Drop searches come from drops, never from the form. Describe your customer (`icp`) has a form of its own. */
export type FormKind = Exclude<SearchKind, 'drop' | 'icp'>;

export const FORM_KINDS: readonly FormKind[] = ['local', 'web', 'launches', 'domains'];

export function isFormKind(value: unknown): value is FormKind {
  return typeof value === 'string' && (FORM_KINDS as readonly string[]).includes(value);
}

export const LIMIT_PRESETS = [25, 100, 250, 500] as const;

export const DEFAULT_LIMIT = 100;

export interface SearchForm {
  kind: FormKind;
  niche: string;
  location: string;
  keyword: string;
  /** ISO 3166-1 alpha-2, or '' for any country. */
  country: string;
  launchKeyword: string;
  launchWindow: LaunchWindow;
  list: string;
  listCountry: string;
  /** NaN while the field is empty. */
  limit: number;
}

export function emptyForm(kind: FormKind = 'local'): SearchForm {
  return {
    kind,
    niche: '',
    location: '',
    keyword: '',
    country: '',
    launchKeyword: '',
    launchWindow: 'week',
    list: '',
    listCountry: '',
    limit: DEFAULT_LIMIT,
  };
}

export interface ListSummary {
  /** At most one more than `max`, so the form can say the list is too long. */
  items: string[];
  tooLong: boolean;
  domains: number;
  names: number;
}

/** What a pasted list holds: domains go straight to the crawl, names are looked up. */
export function summarizeList(text: string, max: number): ListSummary {
  const items = splitList(text, max + 1);
  const domains = items.filter((item) => itemDomain(item) !== null).length;
  return { items, tooLong: items.length > max, domains, names: items.length - domains };
}

/** The limit the form sends: a whole number from 1 to the plan's maximum, 100 when left empty. */
export function clampLimit(limit: number, max: number = SEARCH_LIMIT_MAX): number {
  const n = Math.round(limit);
  if (!Number.isFinite(n) || n < 1) return Math.min(max, DEFAULT_LIMIT);
  return Math.min(max, n);
}

/**
 * The request for `POST /v1/searches`, or null while a required field is
 * empty or a pasted list is too long. Blank optional fields are left out so
 * the server applies its defaults.
 */
export function buildSearchInput(form: SearchForm, maxLimit: number = SEARCH_LIMIT_MAX): CreateSearchInput | null {
  const limit = clampLimit(form.limit, maxLimit);
  switch (form.kind) {
    case 'local': {
      const niche = form.niche.trim();
      const location = form.location.trim();
      if (!niche || !location) return null;
      return { kind: 'local', params: { niche, location }, limit };
    }
    case 'web': {
      const keyword = form.keyword.trim();
      if (!keyword) return null;
      return { kind: 'web', params: { keyword, ...(form.country ? { country: form.country } : {}) }, limit };
    }
    case 'launches': {
      const keyword = form.launchKeyword.trim();
      return { kind: 'launches', params: { days: WINDOW_DAYS[form.launchWindow], ...(keyword ? { keyword } : {}) }, limit };
    }
    case 'domains': {
      const { items, tooLong, names } = summarizeList(form.list, maxLimit);
      if (items.length === 0 || tooLong) return null;
      // A country only helps to look up names; a list of domains needs none.
      return { kind: 'domains', params: { items, ...(form.listCountry && names > 0 ? { country: form.listCountry } : {}) } };
    }
  }
}

/** Why the form will not submit, in words, or null when it will. */
export function formProblem(form: SearchForm, maxLimit: number = SEARCH_LIMIT_MAX): string | null {
  if (buildSearchInput(form, maxLimit)) return null;
  if (form.kind !== 'domains') return 'Fill in the highlighted words.';
  return summarizeList(form.list, maxLimit).tooLong
    ? `Up to ${maxLimit.toLocaleString('en-US')} companies in one list.`
    : 'Paste a domain or a company name per line.';
}

/**
 * Whether a search can run again into the same list with the form: it ended,
 * and it has a form kind. A drop's searches never do; a plain words search
 * keeps filling through ongoing instead.
 */
export function canSearchMore(search: Search): search is Search & { kind: FormKind } {
  return isFormKind(search.kind) && !isActive(search.status);
}

/** An ended search that came back with fewer companies than it asked for, so widening it is the next step. */
export function foundFew(search: Search): search is Search & { kind: FormKind } {
  return canSearchMore(search) && search.companiesFound < search.limit;
}

/** The launch window closest to a number of days. */
function windowFor(days: number): LaunchWindow {
  return (Object.keys(WINDOW_DAYS) as LaunchWindow[]).reduce((best, w) =>
    Math.abs(WINDOW_DAYS[w] - days) < Math.abs(WINDOW_DAYS[best] - days) ? w : best,
  );
}

/**
 * The form for another run of a search: its kind, the latest run's params
 * and limit to start from. A list starts empty, since it takes more items.
 */
export function formFromSearch(search: Search & { kind: FormKind }): SearchForm {
  const form = emptyForm(search.kind);
  const latest = searchRuns(search).at(-1);
  form.limit = latest && search.kind !== 'domains' ? latest.limit : DEFAULT_LIMIT;
  switch (search.kind) {
    case 'local':
      return { ...form, niche: search.params.niche, location: search.params.location };
    case 'web':
      return { ...form, keyword: search.params.keyword, country: search.params.country ?? '' };
    case 'launches':
      return { ...form, launchKeyword: search.params.keyword ?? '', launchWindow: windowFor(search.params.days) };
    case 'domains':
      return { ...form, listCountry: search.params.country ?? '' };
  }
}
