import { SiteProfileFields, type CreateSearchInput, type Search, type UpdateSiteProfileRequest } from '@nvoke/shared';
import { ApiError } from './api';
import { formatNumber, KIND_LABEL, searchTitle } from './desktop';

/**
 * Start from your website, as data: the website field, the build's timed
 * phases, the error lines, how a suggestion reads and the profile edit form.
 * The screens are components/app/site-profile.tsx.
 */

export const MANUAL_PATH = '/app/new?manual=1';
export const WEBSITE_PATH = '/app/new';

export type WebsiteRead = { ok: true; website: string; domain: string } | { ok: false; problem: string };

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

/**
 * Reads what the user typed as a website: a domain, a URL or even their own
 * email address. `website` is what the server gets (the bare host, or the URL
 * when it names a page), `domain` is what the screen shows.
 */
export function readWebsite(raw: string): WebsiteRead {
  let text = raw.trim();
  if (!text) return { ok: false, problem: 'Type your website first.' };
  // An email address gives its domain: "mia@acme.dk" means acme.dk.
  if (/^[^\s/@]+@[^\s/@]+$/.test(text)) text = text.slice(text.lastIndexOf('@') + 1);
  if (/\s/.test(text)) return { ok: false, problem: 'A website has no spaces. Try yourcompany.com.' };
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) text = `https://${text}`;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return { ok: false, problem: 'That doesn’t look like a website. Try yourcompany.com.' };
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { ok: false, problem: 'That doesn’t look like a website. Try yourcompany.com.' };
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (host.startsWith('[') || IPV4.test(host)) return { ok: false, problem: 'Use your site’s domain, not an IP address.' };
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) {
    return { ok: false, problem: 'That address is private. Use your public website.' };
  }
  const tld = host.split('.').at(-1) ?? '';
  if (!host.includes('.') || !/^(?:[a-z]{2,}|xn--[a-z0-9-]+)$/.test(tld)) {
    return { ok: false, problem: 'That doesn’t look like a website. Try yourcompany.com.' };
  }
  const domain = host.replace(/^www\./, '');
  const page = url.pathname !== '/' || url.search !== '';
  return { ok: true, website: page ? `${url.protocol}//${host}${url.pathname}${url.search}` : host, domain };
}

/** The domain to name in copy, from a stored profile's website or what was typed. */
export function displayDomain(website: string): string {
  const read = readWebsite(website);
  return read.ok ? read.domain : website.trim();
}

/** The build's phases, shown one after another while the server works. No percentages: we don't know them. */
export const BUILD_PHASES: { at: number; label: (domain: string) => string }[] = [
  { at: 0, label: (d) => `Reading ${d}` },
  { at: 5_000, label: () => 'Reading the about and pricing pages' },
  { at: 11_000, label: () => 'Working out what you sell' },
  { at: 17_000, label: () => 'Picking your buyers' },
  { at: 24_000, label: () => 'Planning the searches' },
];

/** After this long the last phase says that big sites take longer. */
export const BUILD_SLOW_MS = 35_000;

/** The phase on screen after `elapsed` milliseconds. */
export function buildPhase(elapsed: number): number {
  let index = 0;
  BUILD_PHASES.forEach((phase, i) => {
    if (elapsed >= phase.at) index = i;
  });
  return index;
}

/** One short line for a failed build, naming the site where it helps. */
export function buildProblem(error: unknown, domain: string): string {
  if (!(error instanceof ApiError)) return 'Something broke on our side. Try again.';
  switch (error.code) {
    case 'site_unreadable':
      switch (error.detail) {
        case 'unreachable':
          return `${domain} didn’t answer. Check the address, or try again in a minute.`;
        case 'blocked':
          return `robots.txt keeps us out of ${domain}.`;
        case 'refused':
          return `${domain} turns our servers away.`;
        case 'js_only':
          return `${domain} only shows its text with JavaScript. We read plain pages.`;
        case 'empty':
          return `${domain} has too little text to go on.`;
        case 'not_allowed':
          return 'That address is private or local. Use your public website.';
        default:
          return `We couldn’t read ${domain}.`;
      }
    case 'rate_limited':
      return 'That’s 10 sites read today. Reading resets tomorrow.';
    case 'ai_unavailable':
      return 'Claude isn’t answering right now. Try again in a few minutes.';
    case 'invalid_request':
      return 'That doesn’t look like a website. Try yourcompany.com.';
    default:
      return error.message;
  }
}

const SUGGESTION_KIND: Record<CreateSearchInput['kind'], string> = {
  local: KIND_LABEL.local,
  web: KIND_LABEL.web,
  launches: KIND_LABEL.launches,
  domains: 'Named companies',
};

/** A suggestion's title, the same words the searches list will use once it runs. */
export function suggestionTitle(search: CreateSearchInput): string {
  // The searches list reads a stored search; a request has the same kinds and params, minus defaults.
  return searchTitle(search as Pick<Search, 'kind' | 'params'>);
}

/** "Local businesses, up to 100 companies" or "Named companies, 12 of them". */
export function suggestionCaption(search: CreateSearchInput): string {
  const kind = SUGGESTION_KIND[search.kind];
  if (search.kind === 'domains') {
    const n = search.params.items.length;
    return `${kind}, ${formatNumber(n)} ${n === 1 ? 'company' : 'companies'}`;
  }
  return search.limit ? `${kind}, up to ${formatNumber(search.limit)} companies` : kind;
}

/** The edit form: lists as text, country as the picker's uppercase code or '' for none. */
export interface ProfileForm {
  name: string;
  summary: string;
  offer: string;
  audience: string;
  /** One per line. */
  proofPoints: string;
  /** Comma separated. */
  voice: string;
  language: string;
  country: string;
}

export function profileForm(fields: SiteProfileFields): ProfileForm {
  return {
    name: fields.name,
    summary: fields.summary,
    offer: fields.offer,
    audience: fields.audience,
    proofPoints: fields.proofPoints.join('\n'),
    voice: fields.voice.join(', '),
    language: fields.language,
    country: fields.country?.toUpperCase() ?? '',
  };
}

const FIELD_PROBLEM: Record<keyof SiteProfileFields, string> = {
  name: 'Name: 1 to 120 characters.',
  summary: 'Summary: one sentence, up to 300 characters.',
  offer: 'What you sell: 1 to 500 characters.',
  audience: 'Who buys it: 1 to 500 characters.',
  proofPoints: 'Proof: up to 8 lines, 200 characters each.',
  voice: 'Your words: up to 12, 80 characters each.',
  language: 'Language: two letters, like en or da.',
  country: 'Country: pick one from the list.',
};

const lines = (text: string): string[] =>
  text
    .split('\n')
    .map((l) => l.replace(/^\s*[-*•]\s+/, '').trim())
    .filter(Boolean);

const commas = (text: string): string[] =>
  text
    .split(',')
    .map((w) => w.trim())
    .filter(Boolean);

/**
 * The PATCH body for an edited form: only the fields that changed, or null
 * when nothing did. A field the server would refuse gives a problem instead.
 */
export function profilePatch(
  form: ProfileForm,
  current: SiteProfileFields,
): { ok: true; patch: UpdateSiteProfileRequest | null } | { ok: false; problem: string } {
  const parsed = SiteProfileFields.safeParse({
    name: form.name,
    summary: form.summary,
    offer: form.offer,
    audience: form.audience,
    proofPoints: lines(form.proofPoints),
    voice: commas(form.voice),
    language: form.language.trim().toLowerCase(),
    country: form.country.trim() ? form.country.trim() : null,
  });
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0] as keyof SiteProfileFields | undefined;
    return { ok: false, problem: (field && FIELD_PROBLEM[field]) || 'Something in the form is off.' };
  }
  const patch: Record<string, unknown> = {};
  for (const key of Object.keys(parsed.data) as (keyof SiteProfileFields)[]) {
    if (JSON.stringify(parsed.data[key]) !== JSON.stringify(current[key])) patch[key] = parsed.data[key];
  }
  return { ok: true, patch: Object.keys(patch).length ? (patch as UpdateSiteProfileRequest) : null };
}
