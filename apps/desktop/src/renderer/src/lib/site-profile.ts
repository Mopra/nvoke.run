/**
 * Start from your website: the pure parts of the New search website step
 * (docs/desktop/site-profile.md). What the field accepts, the phases shown
 * while the server reads the site, the line for each error and the profile
 * edit form as data. No `window.nvoke` and no `@/` imports, so tests run in
 * plain Node.
 */
import type { CreateSearchRequest, SiteProfileFields, UpdateSiteProfileRequest } from '@nvoke/shared';
import { formatNumber, KIND_LABEL } from './format';

/** What the user typed, ready to send, and the bare domain to show while it is read. */
export interface WebsiteInput {
  website: string;
  domain: string;
}

/**
 * Reads the website field: a domain or a URL, with or without a scheme or
 * path. Null for anything that is not a public looking host name, so the
 * button can say so before a 20 second round trip. The server checks again.
 */
export function parseWebsite(raw: string): WebsiteInput | null {
  const text = raw.trim();
  if (!text || text.length > 500 || /\s/.test(text)) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (url.username || url.password) return null;
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  // A dot and a letter TLD: rules out "localhost", bare words and IP addresses.
  if (!/^([a-z0-9-]+\.)+[a-z][a-z0-9-]*[a-z0-9]$/.test(host)) return null;
  if (host.split('.').some((label) => label.startsWith('-') || label.endsWith('-'))) return null;
  return { website: text, domain: host.replace(/^www\./, '') };
}

/** The calm lines shown while a profile builds, with the second they start. No percentages: the server gives none. */
export const BUILD_PHASES: { at: number; line: (domain: string) => string }[] = [
  { at: 0, line: (domain) => `Reading ${domain}` },
  { at: 6, line: () => 'Reading the about, pricing and services pages' },
  { at: 13, line: () => 'Working out who buys from you' },
  { at: 20, line: () => 'Planning searches that find them' },
  { at: 34, line: () => 'Still planning. Big sites take a little longer' },
];

/** The phase line for a build that started `elapsedMs` ago. */
export function buildPhase(elapsedMs: number, domain: string): string {
  const seconds = Math.max(0, elapsedMs) / 1000;
  let current = BUILD_PHASES[0]!;
  for (const phase of BUILD_PHASES) if (seconds >= phase.at) current = phase;
  return current.line(domain);
}

/** One short line for a failed build or edit. `detail` is the server's reason on `site_unreadable`. */
export function siteProfileErrorLine(status: number, code: string, detail: string | null, domain: string): string {
  const site = domain || 'that site';
  if (code === 'site_unreadable') {
    switch (detail) {
      case 'unreachable':
        return `${site} did not answer. Check the address, or try again in a minute.`;
      case 'blocked':
        return `robots.txt keeps us out of ${site}.`;
      case 'refused':
        return `${site} refuses our servers.`;
      case 'js_only':
        return `${site} needs JavaScript to show its text, and we read plain HTML.`;
      case 'empty':
        return `${site} has too little text to go on.`;
      case 'not_allowed':
        return 'That address is private or local. Use your public website.';
      default:
        return `We could not read ${site}.`;
    }
  }
  if (code === 'rate_limited') return 'That is 10 reads today. Try again tomorrow.';
  if (code === 'ai_unavailable') return 'Claude is not answering right now. Try again in a few minutes.';
  if (code === 'invalid_request') return 'That does not look like a website. Try yourcompany.com.';
  if (code === 'not_found') return 'Your profile is gone. Read your site again.';
  if (status === 0) return 'Can’t reach nvoke. Check your connection.';
  if (status === 401) return 'Session expired. Sign in again.';
  if (status >= 500) return 'Our server broke. Try again in a minute.';
  return `Something went wrong (${code || status}).`;
}

/** The caption under a suggested search: its kind and how many companies it asks for. */
export function suggestionCaption(search: CreateSearchRequest): string {
  if (search.kind === 'domains') {
    const n = search.limit ?? search.params.items.length;
    return `${KIND_LABEL.domains}, ${formatNumber(n)} ${n === 1 ? 'company' : 'companies'}`;
  }
  return search.limit ? `${KIND_LABEL[search.kind]}, up to ${formatNumber(search.limit)} companies` : KIND_LABEL[search.kind];
}

/** The profile as the edit form holds it: plain strings, lists as lines and commas. */
export interface ProfileDraft {
  name: string;
  summary: string;
  offer: string;
  audience: string;
  /** One per line. */
  proofPoints: string;
  /** Comma separated. */
  voice: string;
  language: string;
  /** ISO alpha-2, or '' for none. */
  country: string;
}

export function profileToDraft(profile: SiteProfileFields): ProfileDraft {
  return {
    name: profile.name,
    summary: profile.summary,
    offer: profile.offer,
    audience: profile.audience,
    proofPoints: profile.proofPoints.join('\n'),
    voice: profile.voice.join(', '),
    language: profile.language,
    country: profile.country ?? '',
  };
}

const MAX = { name: 120, summary: 300, offer: 500, audience: 500, proof: 200, proofCount: 8, voice: 80, voiceCount: 12 };

export type DraftResult =
  | { ok: true; update: UpdateSiteProfileRequest | null }
  | { ok: false; field: keyof ProfileDraft; message: string };

/**
 * Checks the edit form against the server's limits and returns only the
 * fields that changed. `update: null` means nothing changed.
 */
export function draftToUpdate(draft: ProfileDraft, current: SiteProfileFields): DraftResult {
  const name = draft.name.trim();
  const summary = draft.summary.trim();
  const offer = draft.offer.trim();
  const audience = draft.audience.trim();
  const proofPoints = draft.proofPoints
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const voice = draft.voice
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
  const language = draft.language.trim().toLowerCase();
  const country = draft.country.trim().toLowerCase() || null;

  const required: [keyof ProfileDraft, string, number][] = [
    ['name', name, MAX.name],
    ['summary', summary, MAX.summary],
    ['offer', offer, MAX.offer],
    ['audience', audience, MAX.audience],
  ];
  for (const [field, value, max] of required) {
    if (!value) return { ok: false, field, message: 'Can’t be empty.' };
    if (value.length > max) return { ok: false, field, message: `Up to ${max} characters.` };
  }
  if (proofPoints.length > MAX.proofCount) return { ok: false, field: 'proofPoints', message: `Up to ${MAX.proofCount} lines.` };
  if (proofPoints.some((p) => p.length > MAX.proof)) return { ok: false, field: 'proofPoints', message: `Up to ${MAX.proof} characters a line.` };
  if (voice.length > MAX.voiceCount) return { ok: false, field: 'voice', message: `Up to ${MAX.voiceCount} phrases.` };
  if (voice.some((v) => v.length > MAX.voice)) return { ok: false, field: 'voice', message: `Up to ${MAX.voice} characters a phrase.` };
  if (!/^[a-z]{2}$/.test(language)) return { ok: false, field: 'language', message: 'Two letters, like en or da.' };
  if (country !== null && !/^[a-z]{2}$/.test(country)) return { ok: false, field: 'country', message: 'Pick a country.' };

  const update: UpdateSiteProfileRequest = {};
  if (name !== current.name) update.name = name;
  if (summary !== current.summary) update.summary = summary;
  if (offer !== current.offer) update.offer = offer;
  if (audience !== current.audience) update.audience = audience;
  if (proofPoints.join('\n') !== current.proofPoints.join('\n')) update.proofPoints = proofPoints;
  if (voice.join('\n') !== current.voice.join('\n')) update.voice = voice;
  if (language !== current.language) update.language = language;
  if (country !== (current.country ?? null)) update.country = country;
  return { ok: true, update: Object.keys(update).length > 0 ? update : null };
}
