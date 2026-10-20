import {
  isDecisionMaker,
  SEARCH_LIMIT_MAX,
  type Company,
  type CreateSearchInput,
  type Email,
  type Person,
  type Search,
  type Seniority,
  type SiteProfile,
  type Verification,
} from '@nvoke/shared';
import { formatNumber } from './desktop';

/**
 * Describe your customer (`icp`), as data: the plain words form, the request
 * it makes, and the people first view of a search's results (who to show,
 * how each address was found, the live counts). The screens are
 * components/app/icp-search-screen.tsx and components/app/people-list.tsx.
 */

/** A plain words search asks for the most a search may hold, and keeps filling after that when ongoing. */
export const ICP_LIMIT = 1000;

export const DESCRIPTION_MAX = 2000;
export const PRODUCT_MAX = 1000;
const LOCATIONS_MAX = 30;
const LOCATION_MAX = 200;
const COUNTRIES_MAX = 30;

/** One click fills the description. */
export const ICP_EXAMPLES = [
  'Founders of B2B SaaS startups in the US',
  'Lead gen and outbound agencies in the UK and US',
  'Dental clinics in Manchester',
  'Shopify agencies in Germany with 5 to 50 people',
  'Independent accounting firms in Texas',
] as const;

export interface IcpForm {
  /** Who they sell to, in plain words. */
  description: string;
  /** What they sell, optional. */
  product: string;
  /** ISO 3166-1 alpha-2, uppercase as the picker gives them. */
  countries: string[];
  /** Cities or regions, comma separated. */
  locations: string;
  /** Keep finding new leads after the first run: PATCHed on right after the search starts. */
  ongoing: boolean;
}

export function emptyIcpForm(product = ''): IcpForm {
  return { description: '', product, countries: [], locations: '', ongoing: true };
}

/** What the account's site profile says it sells, to prefill "What do you sell?". Empty without a profile. */
export function productFromProfile(profile: SiteProfile | null | undefined): string {
  return profile?.profile.offer.trim().slice(0, PRODUCT_MAX) ?? '';
}

/** "Austin, Leeds\nLyon" as a list: trimmed, no blanks, no repeats, at most 30. */
export function splitLocations(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(/[,;\n]/)) {
    const place = raw.trim().slice(0, LOCATION_MAX);
    const key = place.toLowerCase();
    if (!place || seen.has(key)) continue;
    seen.add(key);
    out.push(place);
    if (out.length === LOCATIONS_MAX) break;
  }
  return out;
}

/** Adds a country to the list once. '' (any country) adds nothing. */
export function addCountry(countries: string[], code: string): string[] {
  const c = code.trim().toUpperCase();
  if (!c || countries.includes(c) || countries.length >= COUNTRIES_MAX) return countries;
  return [...countries, c];
}

/**
 * The request for `POST /v1/searches`, or null while the description is
 * empty or too long. Blank optional fields are left out so the planner picks.
 */
export function buildIcpInput(form: IcpForm, maxLimit: number = SEARCH_LIMIT_MAX): CreateSearchInput | null {
  const description = form.description.trim();
  if (!description || description.length > DESCRIPTION_MAX) return null;
  const product = form.product.trim().slice(0, PRODUCT_MAX);
  const locations = splitLocations(form.locations);
  return {
    kind: 'icp',
    params: {
      description,
      ...(product ? { product } : {}),
      ...(form.countries.length ? { countries: form.countries.slice(0, COUNTRIES_MAX) } : {}),
      ...(locations.length ? { locations } : {}),
    },
    limit: Math.min(ICP_LIMIT, maxLimit),
  };
}

/** Why the form will not submit, in words, or null when it will. */
export function icpProblem(form: IcpForm): string | null {
  const description = form.description.trim();
  if (!description) return 'Say who you sell to first.';
  if (description.length > DESCRIPTION_MAX) return `Keep it under ${formatNumber(DESCRIPTION_MAX)} characters.`;
  return null;
}

/** Only plain words searches can keep filling (UpdateSearchRequest). */
export function canBeOngoing(search: Pick<Search, 'kind'>): boolean {
  return search.kind === 'icp';
}

/** The search's live line: the server's own words when it has them. */
export function stageLine(search: Pick<Search, 'stageNote'>): string | null {
  const note = search.stageNote?.trim();
  return note ? note : null;
}

/* People first results */

export const SENIORITY_LABEL: Record<Seniority, string> = {
  founder: 'Founder',
  executive: 'Executive',
  director: 'Director',
  manager: 'Manager',
  staff: 'Staff',
};

/** The words on a person's verification badge. `null` is not checked yet. */
export const PEOPLE_VERIFICATION_LABEL: Record<Verification, string> = {
  valid: 'Verified',
  catch_all: 'Catch-all',
  risky: 'Risky',
  invalid: 'Bounces',
  unknown: 'Unverified',
};

export function personName(person: Pick<Person, 'firstName' | 'lastName'>): string {
  return `${person.firstName} ${person.lastName}`.trim();
}

/** A shared inbox nobody in particular reads: info@, hello@, sales@. Hidden unless a company has no person. */
export function isRoleInbox(email: Pick<Email, 'person' | 'kind'>): boolean {
  return !email.person && email.kind === 'generic';
}

/** How nvoke got the address, in a few words, or null when an older copy does not say. */
export function foundViaLabel(email: Pick<Email, 'foundVia' | 'verification' | 'sourceUrl'>): string | null {
  switch (email.foundVia) {
    case 'page':
    case 'cache':
      return 'On their site';
    case 'pattern':
      if (email.verification === 'valid') return 'Pattern, server confirmed';
      if (email.verification === null) return 'Pattern, checking';
      return 'Pattern guess';
    default:
      return email.sourceUrl ? 'On their site' : null;
  }
}

export interface PeopleFilters {
  decisionMakersOnly: boolean;
  verifiedOnly: boolean;
  /** Every address, role inboxes too, not only the fallback for companies without a person. */
  showAll: boolean;
}

export const NO_PEOPLE_FILTERS: PeopleFilters = { decisionMakersOnly: false, verifiedOnly: false, showAll: false };

export interface PersonRow {
  key: string;
  company: Company;
  email: Email;
  person: Person | null;
  decisionMaker: boolean;
  /** A role inbox shown because the company has no person. */
  fallback: boolean;
}

/** Whether a company's emails pass the two filters that narrow by address. */
function passes(email: Email, filters: PeopleFilters): boolean {
  if (filters.verifiedOnly && email.verification !== 'valid') return false;
  if (filters.decisionMakersOnly && !isDecisionMaker(email.person?.seniority)) return false;
  return true;
}

/**
 * One row per person, in the server's order (companies as listed, decision
 * makers first inside each). Role inboxes show only for a company with no
 * valid person, unless `showAll`. The filters apply after that, so a
 * company with a valid person never falls back to its info@ under a filter.
 */
export function peopleRows(companies: Company[], filters: PeopleFilters = NO_PEOPLE_FILTERS): PersonRow[] {
  const rows: PersonRow[] = [];
  for (const company of companies) {
    const people = company.emails.filter((e) => !isRoleInbox(e));
    const fallback = !filters.showAll && people.length === 0;
    // People none of whom is valid keep the role inbox in view: the server checks one for such a company.
    const withInboxes = filters.showAll || !people.some((e) => e.verification === 'valid');
    const shown = withInboxes ? company.emails : people;
    for (const email of shown) {
      if (!passes(email, filters)) continue;
      rows.push({
        key: email.id,
        company,
        email,
        person: email.person ?? null,
        decisionMaker: isDecisionMaker(email.person?.seniority),
        fallback: fallback && isRoleInbox(email),
      });
    }
  }
  return rows;
}

/** The companies view under the same filters: each company keeps the emails that pass, and drops out when none do. */
export function filterCompanies(companies: Company[], filters: PeopleFilters): Company[] {
  if (!filters.verifiedOnly && !filters.decisionMakersOnly) return companies;
  return companies
    .map((c) => ({ ...c, emails: c.emails.filter((e) => passes(e, filters)) }))
    .filter((c) => c.emails.length > 0);
}

export interface PeopleCounts {
  /** Addresses with a named person. */
  people: number;
  /** Named people whose address the mail server accepts. */
  verifiedPeople: number;
  decisionMakers: number;
}

export function peopleCounts(companies: Company[]): PeopleCounts {
  let people = 0;
  let verifiedPeople = 0;
  let decisionMakers = 0;
  for (const c of companies) {
    for (const e of c.emails) {
      if (!e.person) continue;
      people += 1;
      if (e.verification === 'valid') verifiedPeople += 1;
      if (isDecisionMaker(e.person.seniority)) decisionMakers += 1;
    }
  }
  return { people, verifiedPeople, decisionMakers };
}

/** "12 verified people, 5 decision makers", "at least" while more pages are still to load. */
export function countsLine(counts: PeopleCounts, partial: boolean): string {
  const n = (v: number): string => (partial ? `${formatNumber(v)}+` : formatNumber(v));
  const people = `${n(counts.verifiedPeople)} verified ${counts.verifiedPeople === 1 && !partial ? 'person' : 'people'}`;
  const dms = `${n(counts.decisionMakers)} ${counts.decisionMakers === 1 && !partial ? 'decision maker' : 'decision makers'}`;
  return `${people}, ${dms}`;
}
