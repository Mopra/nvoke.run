// Start from your website (docs/SPEC.md, "Site profile"): read the user's
// site, ask Claude what it sells and to whom, and turn its suggestions into
// searches the user starts in one click. One profile per account, editable.

import type { Logger } from 'pino';
import type { Sql } from 'postgres';
import { z } from 'zod';
import {
  CreateSearchRequest,
  SITE_PROFILE_RUNS_PER_DAY,
  SITE_PROFILE_SUGGESTIONS_MAX,
  SITE_PROFILE_SUGGESTIONS_MIN,
  SiteProfileFields,
  type SiteProfile,
  type SuggestedSearch,
  type UpdateSiteProfileRequest,
} from '@nvoke/shared';
import { normalizeWebsite } from '@nvoke/shared/crawl';
import type { Ai } from '../ai/client.js';
import type { SitePage, readSite } from './read-site.js';

/** Companies a suggested search looks at. The user's plan caps what gets verified, not this. */
const SUGGESTION_LIMIT = 100;

/**
 * What Claude fills in. Flat and nullable rather than the discriminated
 * CreateSearchRequest, so the strict tool schema stays simple; each
 * suggestion is checked against CreateSearchRequest afterwards and dropped
 * when it does not fit.
 */
export const ClaudeSiteProfile = z.object({
  profile: z.object({
    name: z.string().describe('The company or product name.'),
    summary: z.string().describe('One plain sentence: what they do.'),
    offer: z.string().describe('What they sell, concretely.'),
    audience: z.string().describe('Who buys it: kind of business or person, size, where.'),
    proofPoints: z.array(z.string()).describe('Claims the site backs up: named customers, numbers, years, awards. Empty when none.'),
    voice: z.array(z.string()).describe('Words and short phrases the site uses about itself, verbatim, in its language.'),
    language: z.string().describe('ISO 639-1 code of the site language, e.g. "da".'),
    country: z.string().nullable().describe('ISO 3166-1 alpha-2 code of the country they sell in most, or null when the site sells worldwide or does not say.'),
  }),
  suggestions: z
    .array(
      z.object({
        kind: z.enum(['local', 'web', 'launches', 'domains']),
        niche: z.string().nullable().describe('local only: the trade as people name it on a map, e.g. "dentist", in the local language.'),
        location: z.string().nullable().describe('local only: a city or region, e.g. "Aarhus".'),
        keyword: z.string().nullable().describe('web: required, a phrase a buyer\'s own website would contain. launches: optional topic.'),
        country: z.string().nullable().describe('web and domains: ISO 3166-1 alpha-2 code, or null.'),
        items: z.array(z.string()).nullable().describe('domains only: 5 to 30 real companies (domains or names) that fit the audience.'),
        why: z.string().describe('One short line on why these companies buy from the user.'),
      }),
    )
    .describe(`${SITE_PROFILE_SUGGESTIONS_MIN} to ${SITE_PROFILE_SUGGESTIONS_MAX} searches that find companies likely to buy.`),
});
export type ClaudeSiteProfile = z.infer<typeof ClaudeSiteProfile>;

const SYSTEM = `You plan lead searches for nvoke, a tool that finds companies and the email addresses on their own websites.

The user gave you their own website. Read it and work out what they sell, to whom, what proof the site offers and the words it uses. Use only what the pages say; never invent customers, numbers or claims. Write in plain English except for "voice", which quotes the site in its own language. Be concrete and short. No marketing language.

Then suggest ${SITE_PROFILE_SUGGESTIONS_MIN} to ${SITE_PROFILE_SUGGESTIONS_MAX} searches that find the user's buyers, using these search kinds:
- local: businesses of one trade in one place, from OpenStreetMap. Best when buyers are physical businesses (clinics, shops, restaurants, workshops). niche is the trade as a map would tag it, location a city or region where the user sells.
- web: companies whose own website matches a keyword, optionally in one country. Best for B2B niches. The keyword is a phrase on the buyer's site, not on the user's.
- launches: products launched on Product Hunt and Show HN in the last week, optionally on a topic. Only when buyers are startups or software makers.
- domains: a list of specific companies. Only when you can name real companies that clearly fit; never invent them.
Mix kinds where it makes sense. Each "why" is one short line in plain words, no hype.`;

/** Builds the prompt from the pages that were read. */
export function profilePrompt(website: string, pages: SitePage[]): string {
  const parts = pages.map(
    (p) => `<page url="${p.url}">\n<title>${p.title}</title>\n<description>${p.description}</description>\n${p.text}\n</page>`,
  );
  return `Website: ${website}\n\n${parts.join('\n\n')}`;
}

/** Turns Claude's flat suggestions into searches the API accepts, dropping those that do not fit. */
export function toSuggestions(raw: ClaudeSiteProfile['suggestions']): SuggestedSearch[] {
  const out: SuggestedSearch[] = [];
  const seen = new Set<string>();
  for (const s of raw) {
    const country = s.country && /^[a-z]{2}$/i.test(s.country) ? s.country : undefined;
    const body =
      s.kind === 'local'
        ? { kind: 'local', params: { niche: s.niche, location: s.location }, limit: SUGGESTION_LIMIT }
        : s.kind === 'web'
          ? { kind: 'web', params: { keyword: s.keyword, ...(country ? { country } : {}) }, limit: SUGGESTION_LIMIT }
          : s.kind === 'launches'
            ? { kind: 'launches', params: s.keyword ? { keyword: s.keyword } : {}, limit: SUGGESTION_LIMIT }
            : { kind: 'domains', params: { items: s.items ?? [], ...(country ? { country } : {}) } };
    const search = CreateSearchRequest.safeParse(body);
    const why = s.why.trim().slice(0, 200);
    if (!search.success || !why) continue;
    const key = JSON.stringify(search.data);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ why, search: search.data });
    if (out.length >= SITE_PROFILE_SUGGESTIONS_MAX) break;
  }
  return out;
}

/** Claude's profile cut to the stored shape: trimmed, capped, empty entries dropped. */
export function toFields(raw: ClaudeSiteProfile['profile'], domain: string): SiteProfileFields {
  const list = (items: string[], max: number, len: number) =>
    items.map((i) => i.trim().slice(0, len)).filter(Boolean).slice(0, max);
  const country = raw.country && /^[a-z]{2}$/i.test(raw.country.trim()) ? raw.country.trim() : null;
  const language = /^[a-z]{2}$/i.test(raw.language.trim()) ? raw.language.trim().toLowerCase() : 'en';
  return SiteProfileFields.parse({
    name: raw.name.trim().slice(0, 120) || domain,
    summary: raw.summary.trim().slice(0, 300) || domain,
    offer: raw.offer.trim().slice(0, 500) || raw.summary.trim().slice(0, 500) || domain,
    audience: raw.audience.trim().slice(0, 500) || 'Not stated on the site',
    proofPoints: list(raw.proofPoints, 8, 200),
    voice: list(raw.voice, 12, 80),
    language,
    country,
  });
}

interface Row {
  website: string;
  domain: string;
  profile: unknown;
  suggestions: unknown;
  pages: unknown;
  created_at: Date;
  updated_at: Date;
}

function toSiteProfile(row: Row): SiteProfile {
  return {
    website: row.website,
    domain: row.domain,
    profile: SiteProfileFields.parse(row.profile),
    // A suggestion stored under an older schema is dropped rather than failing the whole profile.
    suggestions: (row.suggestions as unknown[]).flatMap((s) => {
      const parsed = z.object({ why: z.string(), search: CreateSearchRequest }).safeParse(s);
      return parsed.success ? [parsed.data] : [];
    }),
    pages: row.pages as string[],
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export async function getSiteProfile(sql: Sql, userId: string): Promise<SiteProfile | null> {
  const [row] = await sql<Row[]>`
    select website, domain, profile, suggestions, pages, created_at, updated_at
    from site_profiles where clerk_user_id = ${userId}
  `;
  return row ? toSiteProfile(row) : null;
}

export async function updateSiteProfile(sql: Sql, userId: string, patch: UpdateSiteProfileRequest): Promise<SiteProfile | null> {
  const current = await getSiteProfile(sql, userId);
  if (!current) return null;
  const profile = SiteProfileFields.parse({ ...current.profile, ...patch });
  const [row] = await sql<Row[]>`
    update site_profiles set profile = ${sql.json(profile)}, updated_at = now()
    where clerk_user_id = ${userId}
    returning website, domain, profile, suggestions, pages, created_at, updated_at
  `;
  return row ? toSiteProfile(row) : null;
}

export type BuildResult =
  | { ok: true; profile: SiteProfile }
  | { ok: false; error: 'invalid_request' | 'rate_limited' | 'ai_unavailable' }
  | { ok: false; error: 'site_unreadable'; detail: 'unreachable' | 'blocked' | 'refused' | 'js_only' | 'empty' | 'not_allowed' };

export interface BuildDeps {
  sql: Sql;
  ai: Ai;
  log: Pick<Logger, 'warn'>;
  read: (website: string) => ReturnType<typeof readSite>;
  /** Throws when the host does not resolve to public addresses only. */
  checkHost: (host: string) => Promise<void>;
}

/** Reads the site, asks Claude and replaces the account's profile. */
export async function buildSiteProfile(deps: BuildDeps, userId: string, input: string): Promise<BuildResult> {
  const website = normalizeWebsite(/^https?:\/\//i.test(input) ? input : `https://${input}`);
  if (!website) return { ok: false, error: 'invalid_request' };
  const host = new URL(website).hostname;

  // Every attempt counts, read or not, so the limit also caps what we fetch for the account.
  const [counted] = await deps.sql<{ runs: number }[]>`
    select count(*)::int as runs from site_profile_runs
    where clerk_user_id = ${userId} and created_at > now() - interval '1 day'
  `;
  if (counted!.runs >= SITE_PROFILE_RUNS_PER_DAY) return { ok: false, error: 'rate_limited' };
  await deps.sql`insert into site_profile_runs (clerk_user_id, domain) values (${userId}, ${host})`;

  try {
    await deps.checkHost(host);
  } catch {
    return { ok: false, error: 'site_unreadable', detail: 'not_allowed' };
  }
  const site = await deps.read(website);
  if (!site.ok) return { ok: false, error: 'site_unreadable', detail: site.reason };

  let answer: ClaudeSiteProfile;
  try {
    const res = await deps.ai.structured({
      userId,
      task: 'site-profile',
      tier: 'quality',
      system: SYSTEM,
      prompt: profilePrompt(site.website, site.pages),
      schema: ClaudeSiteProfile,
      toolName: 'save_site_profile',
      toolDescription: 'Saves the profile of the user\'s business and the suggested searches.',
      maxTokens: 4096,
      effort: 'low',
    });
    answer = res.data;
  } catch (err) {
    deps.log.warn({ err, userId }, 'site profile: Claude failed');
    return { ok: false, error: 'ai_unavailable' };
  }

  const suggestions = toSuggestions(answer.suggestions);
  const profile = toFields(answer.profile, site.domain);
  const pages = site.pages.map((p) => p.url);
  const [row] = await deps.sql<Row[]>`
    insert into site_profiles (clerk_user_id, website, domain, profile, suggestions, pages)
    values (${userId}, ${site.website}, ${site.domain}, ${deps.sql.json(profile)}, ${deps.sql.json(suggestions)}, ${deps.sql.json(pages)})
    on conflict (clerk_user_id) do update set
      website = excluded.website, domain = excluded.domain, profile = excluded.profile,
      suggestions = excluded.suggestions, pages = excluded.pages, created_at = now(), updated_at = now()
    returning website, domain, profile, suggestions, pages, created_at, updated_at
  `;
  return { ok: true, profile: toSiteProfile(row!) };
}
