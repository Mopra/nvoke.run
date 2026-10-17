// The plan behind a "Describe your customer" search (docs/SPEC.md, "Describe
// your customer"). One Sonnet call turns the user's plain words into web
// queries phrased the way those companies describe themselves on their own
// sites, directory and list page queries, local trade and city pairs when the
// customer is a local business, and the fit criteria the candidates are
// scored against. The icp adapter (sources/icp.ts) runs it tier by tier:
// core queries, adjacent niches, wider geography, then deeper pages.

import type { Sql } from 'postgres';
import { z } from 'zod';
import type { IcpSearchParams } from '@nvoke/shared';
import type { Ai } from '../ai/client.js';

export const PLAN_VERSION = 1;

/** Caps per part of the plan, so one answer cannot run up the Brave bill. */
export const PLAN_CAPS = { core: 16, directories: 8, adjacent: 14, wider: 14, local: 24, fit: 8, disqualifiers: 10 } as const;

const PlanQuery = z.object({
  q: z.string().min(2).max(200),
  /** ISO 3166-1 alpha-2, lower case. Absent: no country. */
  country: z.string().regex(/^[a-z]{2}$/).optional(),
});
export type PlanQuery = z.infer<typeof PlanQuery>;

const LocalPair = z.object({ niche: z.string().min(2).max(100), location: z.string().min(2).max(200) });
export type LocalPair = z.infer<typeof LocalPair>;

/** The plan as stored in searches.plan. */
export const IcpPlan = z.object({
  version: z.literal(PLAN_VERSION),
  /** The params it was made for: a later run with the same words reuses it. */
  key: z.string(),
  /** Who the customer is, in one line. */
  summary: z.string(),
  fit: z.array(z.string()),
  disqualifiers: z.array(z.string()),
  countries: z.array(z.string()),
  /** Tier 1: how the companies describe themselves on their own sites. */
  core: z.array(PlanQuery),
  /** Tier 1: list pages and agency directories, mined for many companies per request. */
  directories: z.array(PlanQuery),
  /** Tier 2: synonyms and adjacent niches. */
  adjacent: z.array(PlanQuery),
  /** Tier 3: more countries and cities. */
  wider: z.array(PlanQuery),
  /** Tier 1 when the customer is a local business: a trade in a city, from OpenStreetMap. */
  local: z.array(LocalPair),
});
export type IcpPlan = z.infer<typeof IcpPlan>;

/** What Sonnet fills in. Flat and nullable, so the strict schema stays simple; toPlan cleans it. */
export const ClaudePlan = z.object({
  summary: z.string().describe('Who the customer is, in one plain line.'),
  fit: z.array(z.string()).describe('3 to 8 short criteria a fitting company meets, judged from its own website.'),
  disqualifiers: z.array(z.string()).describe('3 to 10 short reasons a result is not a fit, e.g. "a consumer brand", "a job board", "a marketplace or directory", "a competitor of the user".'),
  countries: z.array(z.string()).describe('ISO 3166-1 alpha-2 codes of the core countries, most important first.'),
  core: z.array(z.object({ q: z.string(), country: z.string().nullable() })).describe('10 to 16 queries in the words such companies use about themselves on their homepage.'),
  directories: z.array(z.object({ q: z.string(), country: z.string().nullable() })).describe('4 to 8 queries for list pages and directories that name many such companies.'),
  adjacent: z.array(z.object({ q: z.string(), country: z.string().nullable() })).describe('8 to 14 queries for synonyms and adjacent niches of the same buyer.'),
  wider: z.array(z.object({ q: z.string(), country: z.string().nullable() })).describe('8 to 14 core style queries in further countries or cities.'),
  local: z.array(z.object({ niche: z.string(), location: z.string() })).describe('Trade and city pairs, only when the customers are local businesses with a shop or office people visit. Otherwise empty.'),
});
export type ClaudePlan = z.infer<typeof ClaudePlan>;

const SYSTEM = `You plan lead searches for nvoke, a tool that finds companies and the email addresses on their own websites. The user describes their customer in plain words. You turn that into web searches (Brave Search) that land on the homepages of companies that fit.

Rules for queries:
- core: phrase each query the way a fitting company describes itself on its own homepage or services page ("B2B appointment setting agency", "outbound sales consultancy for SaaS", "cold email agency"), not the way a buyer searches and not listicle words ("best", "top"). Vary the wording: services, outcomes, the people they serve. 2 to 6 words each. Write in the language of the country when its companies use their own language on their sites (German for de, Danish for dk), else English.
- directories: queries that find articles and list pages naming many such companies with links to their sites: "top B2B lead generation agencies in London", "best cold email agencies 2026", "beste Leadgenerierung Agenturen Deutschland". These pages are read for the companies they link to. Big directories (clutch.co, sortlist, designrush) mostly refuse to be read, so at most one query names one.
- adjacent: synonyms and neighbouring niches with the same buyer profile (for example demand generation, appointment setting, sales development outsourcing, growth agencies, RevOps consultancies when the customer is a lead generation agency).
- wider: the best core queries again for further countries (when the user named no countries) or further big cities in the user's countries (put the city in the query).
- local: only when the customer is a local business people visit (clinics, restaurants, workshops, shops). The trade as a map would tag it, in the local language, and a real city.
- Every query has a country (ISO 3166-1 alpha-2) unless it is truly global.
- When the user named countries, stay inside them. When they named none, pick the countries where such companies are most common and most reachable, at most 8.
- Fit criteria and disqualifiers are short and concrete; they are used to score each result from its name, address and search snippet. Always disqualify consumer brands, job boards, marketplaces and directories, news and media, and companies that sell what the user sells to the same buyers (competitors) unless the user says competitors are welcome.`;

/** The params as one string: a later run with the same words reuses the stored plan. */
export function planKey(params: IcpSearchParams): string {
  const norm = (v: string | undefined) => (v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  return JSON.stringify([
    norm(params.description),
    norm(params.product),
    [...(params.countries ?? [])].sort(),
    (params.locations ?? []).map(norm).sort(),
  ]);
}

export function planPrompt(params: IcpSearchParams): string {
  const lines = [`Who the user sells to:\n${params.description}`];
  if (params.product) lines.push(`What the user sells:\n${params.product}`);
  lines.push(
    params.countries?.length
      ? `Countries to search: ${params.countries.map((c) => c.toUpperCase()).join(', ')}. Stay inside them.`
      : 'Countries: not given. Pick them.',
  );
  if (params.locations?.length) lines.push(`Cities or regions to favour: ${params.locations.join(', ')}`);
  return lines.join('\n\n');
}

const cleanCountry = (c: string | null | undefined): string | undefined => {
  const v = c?.trim().toLowerCase();
  return v && /^[a-z]{2}$/.test(v) ? (v === 'uk' ? 'gb' : v) : undefined;
};

/** Sonnet's answer cut to the stored plan: trimmed, deduplicated, capped, outside countries dropped. */
export function toPlan(raw: ClaudePlan, params: IcpSearchParams): IcpPlan {
  const allowed = params.countries?.length ? new Set(params.countries) : null;
  const seen = new Set<string>();
  const queries = (items: ClaudePlan['core'], max: number): PlanQuery[] => {
    const out: PlanQuery[] = [];
    for (const item of items) {
      const q = item.q.replace(/\s+/g, ' ').trim().slice(0, 200);
      const country = cleanCountry(item.country);
      if (q.length < 2) continue;
      if (allowed && country && !allowed.has(country)) continue;
      const key = `${q.toLowerCase()}|${country ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(country ? { q, country } : { q });
      if (out.length >= max) break;
    }
    return out;
  };
  const list = (items: string[], max: number) =>
    items.map((i) => i.replace(/\s+/g, ' ').trim().slice(0, 160)).filter(Boolean).slice(0, max);
  const localSeen = new Set<string>();
  const local = raw.local
    .map((p) => ({ niche: p.niche.trim().slice(0, 100), location: p.location.trim().slice(0, 200) }))
    .filter((p) => {
      const key = `${p.niche.toLowerCase()}|${p.location.toLowerCase()}`;
      if (p.niche.length < 2 || p.location.length < 2 || localSeen.has(key)) return false;
      localSeen.add(key);
      return true;
    })
    .slice(0, PLAN_CAPS.local);
  const countries = [...new Set(raw.countries.map(cleanCountry).filter((c): c is string => !!c && (!allowed || allowed.has(c))))];
  return IcpPlan.parse({
    version: PLAN_VERSION,
    key: planKey(params),
    summary: raw.summary.trim().slice(0, 300) || params.description.slice(0, 300),
    fit: list(raw.fit, PLAN_CAPS.fit),
    disqualifiers: list(raw.disqualifiers, PLAN_CAPS.disqualifiers),
    countries: countries.length ? countries : [...(params.countries ?? [])],
    core: queries(raw.core, PLAN_CAPS.core),
    directories: queries(raw.directories, PLAN_CAPS.directories),
    adjacent: queries(raw.adjacent, PLAN_CAPS.adjacent),
    wider: queries(raw.wider, PLAN_CAPS.wider),
    local,
  });
}

/** Web queries in the plan, all tiers. */
export function planQueryCount(plan: IcpPlan): number {
  return plan.core.length + plan.directories.length + plan.adjacent.length + plan.wider.length;
}

export interface PlanResult {
  plan: IcpPlan;
  costUsd: number;
}

/** Asks Sonnet for the plan. Throws AiError when Claude is unavailable or answers badly. */
export async function makePlan(ai: Ai, userId: string, params: IcpSearchParams): Promise<PlanResult> {
  const res = await ai.structured({
    userId,
    task: 'plan',
    tier: 'quality',
    system: SYSTEM,
    prompt: planPrompt(params),
    schema: ClaudePlan,
    toolName: 'save_search_plan',
    toolDescription: 'Saves the search plan: queries by tier, local pairs and fit criteria.',
    maxTokens: 6000,
    effort: 'low',
  });
  const plan = toPlan(res.data, params);
  if (plan.core.length + plan.local.length === 0) throw new Error('the plan has no queries');
  return { plan, costUsd: res.costUsd };
}

/** The plan stored on the search when it was made for the same params. */
export async function storedPlan(sql: Sql, searchId: string, params: IcpSearchParams): Promise<IcpPlan | null> {
  const [row] = await sql<{ plan: unknown }[]>`select plan from searches where id = ${searchId}`;
  const parsed = IcpPlan.safeParse(row?.plan);
  return parsed.success && parsed.data.key === planKey(params) ? parsed.data : null;
}

export async function savePlan(sql: Sql, searchId: string, plan: IcpPlan): Promise<void> {
  await sql`update searches set plan = ${sql.json(plan as never)} where id = ${searchId}`;
}
