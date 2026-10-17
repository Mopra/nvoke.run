// The plan behind a "Describe your customer" search (docs/SPEC.md, "Describe
// your customer"). One Sonnet call turns the user's plain words into web
// queries phrased the way those companies describe themselves on their own
// sites, directory and list page queries, local trade and city pairs when the
// customer is a local business, and the fit criteria the candidates are
// scored against. The icp adapter (sources/icp.ts) runs it tier by tier:
// core queries and job posts for sales roles (hiring.ts), adjacent niches,
// wider geography, then deeper pages. When a
// search comes up short, replan asks for a fresh round that repeats nothing
// (ongoing.ts runs it).

import type { Sql } from 'postgres';
import { z } from 'zod';
import type { IcpSearchParams } from '@nvoke/shared';
import type { Ai } from '../ai/client.js';
import { DEFAULT_HIRING_ROLES, atsFor, hiringQuery, impliesSalesTeams } from './hiring.js';

export const PLAN_VERSION = 1;

/** Caps per part of the plan, so one answer cannot run up the Brave bill. */
export const PLAN_CAPS = { core: 18, directories: 14, adjacent: 14, wider: 14, local: 24, fit: 8, disqualifiers: 12, segments: 6, hiring: 8, hiringRoles: 4 } as const;

const PlanQuery = z.object({
  // Job post queries name several boards: `"account executive" (site:jobs.lever.co OR ...)`.
  q: z.string().min(2).max(300),
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
  /** The kinds of customer the description names, each searched in proportion. Absent on older plans. */
  segments: z.array(z.string()).optional(),
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
  /** Tier 1 when the customer runs its own sales: job posts for these roles on public job boards. Absent on older plans. */
  hiringRoles: z.array(z.string()).optional(),
  /** The Brave queries for those job posts, one per role and country. Absent on older plans. */
  hiring: z.array(PlanQuery).optional(),
  /** Which fresh round this is: absent for the first plan, 1 for the first replan. */
  round: z.number().int().positive().optional(),
  /** Every query and local pair earlier plans ran (`ranKeys`), so a replan repeats none of them. */
  ran: z.array(z.string()).optional(),
  /** Paid Brave requests a run of this plan may make, when smaller than the server's: an ongoing round's reservation. */
  braveBudget: z.number().int().nonnegative().optional(),
});
export type IcpPlan = z.infer<typeof IcpPlan>;

/** What Sonnet fills in. Flat and nullable, so the strict schema stays simple; toPlan cleans it. */
export const ClaudePlan = z.object({
  summary: z.string().describe('Who the customer is, in one plain line.'),
  segments: z.array(z.string()).describe('1 to 6 kinds of customer company the description names, each as a short noun phrase, e.g. "outbound and lead generation agencies", "small B2B software companies whose founders sell".').default([]),
  fit: z.array(z.string()).describe('3 to 8 short criteria a fitting company meets, judged from its own website.'),
  disqualifiers: z.array(z.string()).describe('3 to 10 short reasons a result is not a fit, e.g. "a consumer brand", "a job board", "a marketplace or directory", "a competitor of the user".'),
  countries: z.array(z.string()).describe('ISO 3166-1 alpha-2 codes of the core countries, most important first.'),
  core: z.array(z.object({ q: z.string(), country: z.string().nullable() })).describe('12 to 18 queries in the words such companies use about themselves on their homepage, spread over every segment.'),
  directories: z.array(z.object({ q: z.string(), country: z.string().nullable() })).describe('6 to 14 queries for list pages and directories that name many such companies.'),
  adjacent: z.array(z.object({ q: z.string(), country: z.string().nullable() })).describe('8 to 14 queries for synonyms and adjacent niches of the same buyer.'),
  wider: z.array(z.object({ q: z.string(), country: z.string().nullable() })).describe('8 to 14 core style queries in further countries or cities.'),
  local: z.array(z.object({ niche: z.string(), location: z.string() })).describe('Trade and city pairs, only when the customers are local businesses with a shop or office people visit. Otherwise empty.'),
  hiringRoles: z
    .array(z.string())
    .describe('0 to 4 job titles a fitting company advertises when it builds the sales team the user sells to, in English as job boards write them ("sales development representative", "account executive", "founding account executive"). Only when the customers include companies that sell through their own team or founders who sell; otherwise empty.')
    .default([]),
});
/** The input side, so plans written before segments existed still type check. */
export type ClaudePlan = z.input<typeof ClaudePlan>;

const SYSTEM = `You plan lead searches for nvoke, a tool that finds companies and the email addresses on their own websites. The user describes their customer in plain words. You turn that into web searches (Brave Search) that land on the homepages of companies that fit.

First list the segments: every distinct kind of customer the description names. A segment named by a role (founders, SDRs, freelancers, small sales teams) becomes the kind of company where that role buys: "founders of B2B companies" is small B2B software and service companies, "small sales teams" is small and mid sized B2B companies that sell through their own team, "freelancers" is one person consultancies and freelancers with their own site. Then spread the core, adjacent and wider queries over every segment, at least two core queries per segment, weighted by how plainly a company's own homepage shows it is one: an agency or freelancer says what it does on its homepage, while an in-house sales team rarely shows, so aim those queries at the companies whose own words show it (B2B startups that sell to businesses, "book a demo" software for small businesses, companies hiring their first SDRs). Never let one segment take nearly all of the plan, and never search for the user's competitors as if they were a segment.

Rules for queries:
- core: phrase each query the way a fitting company describes itself on its own homepage or services page ("B2B appointment setting agency", "cold email agency", "sales automation software for small businesses", "freelance B2B sales consultant"), not the way a buyer searches and not listicle words ("best", "top"). Vary the wording: services, outcomes, the people they serve. 2 to 6 words each. Write in the language of the country when its companies use their own language on their sites (German for de, Danish for dk), else English.
- directories: queries that find articles and list pages naming many such companies with links to their sites: "top B2B lead generation agencies in London", "best cold email agencies 2026", "B2B SaaS startups in Berlin", "beste Leadgenerierung Agenturen Deutschland". Partner and agency directories of the tools such companies use name many of them too ("lemlist partner agencies", "Instantly agency partners"). These pages are read for the companies they link to. Big directories (clutch.co, sortlist, designrush) mostly refuse to be read, so at most one query names one.
- adjacent: synonyms and other names for the same segments, and niches whose companies do the same thing (appointment setting, sales development outsourcing and telemarketing when the customer runs outbound). Not neighbouring trades that do something else: no general marketing, SEO, ads, web design or CRM consultancies unless the user asks for them.
- wider: the best core queries again for further countries (when the user named no countries) or further big cities in the user's countries (put the city in the query).
- hiringRoles: when the customers include companies that run their own sales or outbound (founders of B2B companies, small sales teams, SDRs), the job titles such a company posts when it hires for it. A company advertising a sales development or account executive role is doing outbound now; nvoke finds those posts on public job boards. Leave it empty for agencies only, local businesses and consumers.
- local: only when the customer is a local business people visit (clinics, restaurants, workshops, shops). The trade as a map would tag it, in the local language, and a real city.
- Every query has a country (ISO 3166-1 alpha-2) unless it is truly global.
- When the user named countries, stay inside them. When they named none, pick the countries where such companies are most common and most reachable, at most 8.
- Fit criteria and disqualifiers are short and concrete; they are used to score each result from its name, address, search snippet and homepage title. Say what a fitting company does, and name the neighbouring kinds that are not a fit. Respect size words in the description (small, founders, freelancers): disqualify large enterprises then. Always disqualify consumer brands, job boards, marketplaces and directories, news and media, and companies that sell what the user sells or something close to it to the same buyers (competitors: for a lead finder, email finders, data vendors and sales tools) unless the user says competitors are welcome.`;

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

type RawQuery = ClaudePlan['core'][number];

/** The key a query is known by across plans: `q|country`, lower case. */
export const queryKey = (q: PlanQuery): string => `${q.q.toLowerCase()}|${q.country ?? ''}`;
/** The key a local pair is known by across plans. */
export const localKey = (p: LocalPair): string => `local:${p.niche.toLowerCase()}|${p.location.toLowerCase()}`;

/** Cleans raw queries: trimmed, outside countries dropped, none whose key is in `seen` (which it fills), at most `max`. */
function cleanQueries(items: RawQuery[], max: number, allowed: Set<string> | null, seen: Set<string>): PlanQuery[] {
  const out: PlanQuery[] = [];
  for (const item of items) {
    if (out.length >= max) break;
    const q = item.q.replace(/\s+/g, ' ').trim().slice(0, 200);
    const country = cleanCountry(item.country);
    if (q.length < 2) continue;
    if (allowed && country && !allowed.has(country)) continue;
    const query = country ? { q, country } : { q };
    const key = queryKey(query);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(query);
  }
  return out;
}

/** Cleans raw local pairs the same way. */
function cleanLocal(items: ClaudePlan['local'], max: number, seen: Set<string>): LocalPair[] {
  const out: LocalPair[] = [];
  for (const item of items) {
    if (out.length >= max) break;
    const pair = { niche: item.niche.trim().slice(0, 100), location: item.location.trim().slice(0, 200) };
    const key = localKey(pair);
    if (pair.niche.length < 2 || pair.location.length < 2 || seen.has(key)) continue;
    seen.add(key);
    out.push(pair);
  }
  return out;
}

/** Roles cleaned: trimmed, deduplicated, at most PLAN_CAPS.hiringRoles. */
function cleanRoles(roles: string[]): string[] {
  const out = new Map<string, string>();
  for (const r of roles) {
    const role = r.replace(/["()]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
    if (role.length >= 3 && !out.has(role.toLowerCase())) out.set(role.toLowerCase(), role);
  }
  return [...out.values()].slice(0, PLAN_CAPS.hiringRoles);
}

/**
 * Job post queries: each role on the job boards a country's companies use,
 * every country for the first role before the second, at most `max`, none
 * whose key is in `seen` (which it fills).
 */
export function hiringQueries(roles: string[], countries: string[], max: number, seen: Set<string>): PlanQuery[] {
  const out: PlanQuery[] = [];
  const where = countries.length ? countries : [undefined];
  for (const role of roles) {
    for (const country of where) {
      if (out.length >= max) return out;
      const query = country ? { q: hiringQuery(role, atsFor(country)), country } : { q: hiringQuery(role, atsFor(undefined)) };
      const key = queryKey(query);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(query);
    }
  }
  return out;
}

/** The roles a plan searches job posts for: Sonnet's, else the defaults when the words name sales teams or outbound. */
export function planRoles(raw: Pick<ClaudePlan, 'hiringRoles' | 'segments'>, params: IcpSearchParams): string[] {
  const roles = cleanRoles(raw.hiringRoles ?? []);
  if (roles.length) return roles;
  return impliesSalesTeams([params.description, ...(raw.segments ?? [])].join(' ')) ? [...DEFAULT_HIRING_ROLES] : [];
}

/** Sonnet's answer cut to the stored plan: trimmed, deduplicated, capped, outside countries dropped. */
export function toPlan(raw: ClaudePlan, params: IcpSearchParams): IcpPlan {
  const allowed = params.countries?.length ? new Set(params.countries) : null;
  const seen = new Set<string>();
  const queries = (items: RawQuery[], max: number): PlanQuery[] => cleanQueries(items, max, allowed, seen);
  const list = (items: string[], max: number) =>
    items.map((i) => i.replace(/\s+/g, ' ').trim().slice(0, 160)).filter(Boolean).slice(0, max);
  const local = cleanLocal(raw.local, PLAN_CAPS.local, new Set());
  const countries = [...new Set(raw.countries.map(cleanCountry).filter((c): c is string => !!c && (!allowed || allowed.has(c))))];
  const planCountries = countries.length ? countries : [...(params.countries ?? [])];
  const roles = planRoles(raw, params);
  return IcpPlan.parse({
    version: PLAN_VERSION,
    key: planKey(params),
    summary: raw.summary.trim().slice(0, 300) || params.description.slice(0, 300),
    segments: list(raw.segments ?? [], PLAN_CAPS.segments),
    fit: list(raw.fit, PLAN_CAPS.fit),
    disqualifiers: list(raw.disqualifiers, PLAN_CAPS.disqualifiers),
    countries: planCountries,
    core: queries(raw.core, PLAN_CAPS.core),
    directories: queries(raw.directories, PLAN_CAPS.directories),
    adjacent: queries(raw.adjacent, PLAN_CAPS.adjacent),
    wider: queries(raw.wider, PLAN_CAPS.wider),
    local,
    ...(roles.length ? { hiringRoles: roles, hiring: hiringQueries(roles, planCountries, PLAN_CAPS.hiring, seen) } : {}),
  });
}

/** Web queries in the plan, all tiers. */
export function planQueryCount(plan: IcpPlan): number {
  return plan.core.length + plan.directories.length + plan.adjacent.length + plan.wider.length + (plan.hiring?.length ?? 0);
}

/** Every web query of a plan, all tiers. */
export function planQueries(plan: IcpPlan): PlanQuery[] {
  return [...plan.core, ...plan.directories, ...plan.adjacent, ...plan.wider, ...(plan.hiring ?? [])];
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

// Fresh rounds

/** Keys kept in `ran`; the oldest go first past this. */
export const MAX_RAN = 800;
/** Earlier queries shown to Sonnet in a replan prompt, newest first. */
const RAN_IN_PROMPT = 250;

/** Every query and local pair this plan and the ones before it ran, oldest first. */
export function ranKeys(plan: IcpPlan): string[] {
  const keys = [
    ...(plan.ran ?? []),
    ...planQueries(plan).map(queryKey),
    ...plan.local.map(localKey),
  ];
  return [...new Set(keys)].slice(-MAX_RAN);
}

/** Countries this plan and the ones before it searched (stored plans keep the union in `countries`). */
export function usedCountries(plan: IcpPlan): Set<string> {
  const out = new Set(plan.countries);
  for (const q of planQueries(plan)) if (q.country) out.add(q.country);
  return out;
}

/** How the search stands when it asks for a fresh round. */
export interface ReplanStats {
  companies: number;
  verified: number;
  /** Verified emails the search aims for. */
  target: number;
  /** Web queries the round may hold, so it fits the Brave budget it runs on. */
  maxQueries: number;
}

/** What Sonnet fills in for a fresh round. */
export const ClaudeReplan = z.object({
  directories: z.array(z.object({ q: z.string(), country: z.string().nullable() })).describe('4 to 10 new queries for list pages and directories that name many such companies.'),
  adjacent: z.array(z.object({ q: z.string(), country: z.string().nullable() })).describe('6 to 14 queries for adjacent niches and synonyms not searched yet.'),
  wider: z.array(z.object({ q: z.string(), country: z.string().nullable() })).describe('6 to 14 core style queries in countries or cities not searched yet.'),
  local: z.array(z.object({ niche: z.string(), location: z.string() })).describe('New trade and city pairs, only when the customers are local businesses. Otherwise empty.'),
});
export type ClaudeReplan = z.infer<typeof ClaudeReplan>;

const REPLAN_SYSTEM = `${SYSTEM}

This is a fresh round for a search that came up short: the searches listed as already run are done and found too few companies. Plan only new ground:
- adjacent: niches and synonyms not searched yet, with the same buyer.
- wider: countries not searched yet (only when the user named none), or cities in the countries searched that no query named yet.
- directories: list page and directory queries not run yet, other wordings, years, cities and industries.
Never repeat a query that was run, or one that differs only in word order, plural or case.`;

const describeQuery = (key: string): string => {
  if (key.startsWith('local:')) return `map: ${key.slice(6).replace('|', ' in ')}`;
  const [q, country] = key.split('|');
  return country ? `${q} (${country.toUpperCase()})` : (q ?? key);
};

export function replanPrompt(params: IcpSearchParams, previous: IcpPlan, stats: ReplanStats): string {
  const ran = ranKeys(previous).slice(-RAN_IN_PROMPT).reverse();
  return [
    planPrompt(params),
    `Who the customer is: ${previous.summary}`,
    `Countries searched so far: ${[...usedCountries(previous)].map((c) => c.toUpperCase()).join(', ') || 'none'}`,
    `So far: ${stats.companies} fitting companies and ${stats.verified} verified email addresses, aiming for ${stats.target}. This is fresh round ${(previous.round ?? 0) + 1}.`,
    `Searches already run (do not repeat them):\n${ran.map((k) => `- ${describeQuery(k)}`).join('\n')}`,
  ].join('\n\n');
}

/**
 * Sonnet's fresh round cut to a plan: nothing an earlier plan ran, inside the
 * user's countries, at most `maxQueries` web queries taken in turn from the
 * directories, the adjacent niches, the wider geography and job posts for
 * the plan's sales roles in countries no earlier plan searched. The round
 * runs them as tier 1 (directories, job posts and local pairs), tier 2 and
 * tier 3. Null when nothing new is left.
 */
export function toReplan(raw: ClaudeReplan, params: IcpSearchParams, previous: IcpPlan, maxQueries: number): IcpPlan | null {
  const allowed = params.countries?.length ? new Set(params.countries) : null;
  const ran = ranKeys(previous);
  const seen = new Set(ran);
  const directories = cleanQueries(raw.directories, PLAN_CAPS.directories, allowed, seen);
  const adjacent = cleanQueries(raw.adjacent, PLAN_CAPS.adjacent, allowed, seen);
  const wider = cleanQueries(raw.wider, PLAN_CAPS.wider, allowed, seen);
  const used = usedCountries(previous);
  const fresh = [...new Set(wider.map((q) => q.country).filter((c): c is string => !!c && !used.has(c)))];
  const hiring = previous.hiringRoles?.length && fresh.length ? hiringQueries(previous.hiringRoles, fresh, PLAN_CAPS.hiring, seen) : [];
  // Taken in turn, so a small budget still gets some of each.
  const take = { directories: 0, adjacent: 0, hiring: 0, wider: 0 };
  for (let left = Math.max(0, Math.floor(maxQueries)); left > 0; ) {
    let took = false;
    for (const tier of ['directories', 'adjacent', 'hiring', 'wider'] as const) {
      const pool = { directories, hiring, adjacent, wider }[tier];
      if (left > 0 && take[tier] < pool.length) {
        take[tier]++;
        left--;
        took = true;
      }
    }
    if (!took) break;
  }
  const local = cleanLocal(raw.local, PLAN_CAPS.local, seen);
  const plan: IcpPlan = {
    version: PLAN_VERSION,
    key: planKey(params),
    summary: previous.summary,
    ...(previous.segments ? { segments: previous.segments } : {}),
    fit: previous.fit,
    disqualifiers: previous.disqualifiers,
    countries: [...usedCountries(previous)],
    core: [],
    directories: directories.slice(0, take.directories),
    adjacent: adjacent.slice(0, take.adjacent),
    wider: wider.slice(0, take.wider),
    local,
    ...(previous.hiringRoles?.length ? { hiringRoles: previous.hiringRoles, hiring: hiring.slice(0, take.hiring) } : {}),
    round: (previous.round ?? 0) + 1,
    ran,
  };
  if (planQueryCount(plan) + plan.local.length === 0) return null;
  for (const c of usedCountries(plan)) if (!plan.countries.includes(c)) plan.countries.push(c);
  return IcpPlan.parse(plan);
}

/** Countries a fresh round searches that no earlier plan did. */
export function freshCountries(previous: IcpPlan, plan: IcpPlan): string[] {
  const used = usedCountries(previous);
  return [...new Set([...plan.directories, ...plan.adjacent, ...plan.wider, ...(plan.hiring ?? [])].map((q) => q.country).filter((c): c is string => !!c && !used.has(c)))];
}

/**
 * Asks Sonnet for a fresh round after `previous` came up short (docs/SPEC.md,
 * "Describe your customer", never short). `plan` is null when nothing new is
 * left. Throws AiError when Claude is unavailable or answers badly.
 */
export async function replan(
  ai: Ai,
  userId: string,
  params: IcpSearchParams,
  previous: IcpPlan,
  stats: ReplanStats,
): Promise<{ plan: IcpPlan | null; costUsd: number }> {
  const res = await ai.structured({
    userId,
    task: 'replan',
    tier: 'quality',
    system: REPLAN_SYSTEM,
    prompt: replanPrompt(params, previous, stats),
    schema: ClaudeReplan,
    toolName: 'save_search_round',
    toolDescription: 'Saves the fresh round: new queries by tier and new local pairs.',
    maxTokens: 5000,
    effort: 'low',
  });
  return { plan: toReplan(res.data, params, previous, stats.maxQueries), costUsd: res.costUsd };
}
