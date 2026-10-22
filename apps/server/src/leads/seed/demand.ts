// What users search for, as a score per queued seed domain (migration
// 1840_seed_demand), so the seed crawls those first. Before a crawl a seed
// domain is only a name, so the score reads the name: a word of a recent
// Sonar plan inside it ("church" in gracechurch.org) and a TLD of one of the
// plan's countries (.nl for a plan in the Netherlands). Each plan of the last
// SEED_DEMAND_DAYS counts the same, however many queries it holds. Without
// recent plans every score is 0 and the list's rank decides, as before.

import type { Sql } from 'postgres';
import { tldCountry } from '../company-index.js';
import type { IcpPlan } from '../planner.js';

/** Plans this recent make the demand. */
export const SEED_DEMAND_DAYS = 30;
/** Words shorter than this match inside too many names ("app" in happy). */
const MIN_WORD = 4;
/** A name's matched word weights count up to this, so a name holding every word cannot outrank the rest by far. */
const MAX_WORD_WEIGHT = 2;
/** A matched word weighs this much more than a matched country: words say what the company is. */
const WORD_FACTOR = 2;

/** Words of a plan that say nothing about the company a domain name stands for. */
const STOP = new Set([
  'about', 'also', 'based', 'best', 'business', 'businesses', 'client', 'company', 'could', 'customer', 'each', 'early', 'first',
  'firm', 'from', 'have', 'hiring', 'into', 'just', 'large', 'like', 'list', 'local', 'many', 'more', 'near', 'online', 'only',
  'other', 'over', 'owner', 'product', 'than', 'that', 'their', 'them', 'they', 'this', 'under', 'which', 'with', 'within', 'your',
  'service', 'serve', 'serving', 'sell', 'selling', 'small', 'stage', 'team', 'united', 'state', 'kingdom', 'founder',
]);

export interface SeedDemand {
  /** Word, stemmed, to the share of recent plans that hold it (0 to 1). */
  words: Map<string, number>;
  /** TLD (".uk" for gb) to the share of recent plans that name its country. */
  tlds: Map<string, number>;
  plans: number;
}

/** "agencies" gives agency, "churches" church, "startups" startup. */
export function stem(word: string): string {
  if (word.endsWith('ies') && word.length > 4) return `${word.slice(0, -3)}y`;
  if (/(ch|sh|ss|x)es$/.test(word)) return word.slice(0, -2);
  if (word.endsWith('s') && !word.endsWith('ss') && word.length > MIN_WORD) return word.slice(0, -1);
  return word;
}

/** The words of a plan text a domain name may hold: lowercased, stemmed, without the generic ones. */
export function demandWords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .map(stem)
    .filter((w) => w.length >= MIN_WORD && !STOP.has(w) && !/^\d+$/.test(w));
}

/** The TLD a country's companies use, or null when its ccTLD is used as a generic one (.io, .co). */
function countryTld(country: string): string | null {
  const tld = country === 'gb' ? 'uk' : country;
  return tldCountry(`x.${tld}`) === country ? tld : null;
}

type DemandPlan = Pick<IcpPlan, 'countries' | 'segments' | 'core' | 'adjacent'>;

export function demandFromPlans(plans: DemandPlan[]): SeedDemand {
  const words = new Map<string, number>();
  const tlds = new Map<string, number>();
  const add = (m: Map<string, number>, keys: Iterable<string>) => {
    for (const k of new Set(keys)) m.set(k, (m.get(k) ?? 0) + 1 / plans.length);
  };
  for (const p of plans) {
    const texts = [...(p.segments ?? []), ...p.core.map((q) => q.q), ...p.adjacent.map((q) => q.q)];
    add(words, texts.flatMap(demandWords));
    add(tlds, p.countries.map(countryTld).filter((t): t is string => t !== null));
  }
  return { words, tlds, plans: plans.length };
}

/** The demand of the Sonar plans made in the last SEED_DEMAND_DAYS. */
export async function seedDemand(sql: Sql, now: Date = new Date()): Promise<SeedDemand> {
  const rows = await sql<{ plan: DemandPlan }[]>`
    select plan from searches
    where kind = 'icp' and plan is not null and created_at > ${now}::timestamptz - make_interval(days => ${SEED_DEMAND_DAYS})
  `;
  return demandFromPlans(rows.map((r) => r.plan).filter((p) => Array.isArray(p.core) && Array.isArray(p.countries)));
}

/** A demand's identity: rescoring the queue again for the same demand changes nothing. */
export function demandKey(d: SeedDemand): string {
  const sorted = (m: Map<string, number>) => [...m].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}:${v.toFixed(3)}`);
  return JSON.stringify([sorted(d.words), sorted(d.tlds)]);
}

/**
 * Scores every queued seed domain against the demand: the matched words'
 * weights in the name before the first dot, up to MAX_WORD_WEIGHT, times
 * WORD_FACTOR, plus the weight of its TLD. Writes only scores that change.
 * How many rows it rescored.
 */
export async function rescoreSeed(sql: Sql, demand: SeedDemand): Promise<number> {
  const [words, wordWeights] = [[...demand.words.keys()], [...demand.words.values()]];
  const [tlds, tldWeights] = [[...demand.tlds.keys()], [...demand.tlds.values()]];
  const [r] = await sql<{ n: number }[]>`
    with w as (select * from unnest(${words}::text[], ${wordWeights}::real[]) as w(word, weight)),
         t as (select * from unnest(${tlds}::text[], ${tldWeights}::real[]) as t(tld, weight)),
         scored as (
           select s.domain,
                  (${WORD_FACTOR}::real * least(${MAX_WORD_WEIGHT}::real, coalesce(
                     (select sum(w.weight) from w where position(w.word in split_part(s.domain, '.', 1)) > 0), 0))
                   + coalesce((select t.weight from t where t.tld = substring(s.domain from '\\.([a-z]{2})$')), 0))::real as score
           from seed_domains s where s.status = 'queued'
         ),
         changed as (
           update seed_domains s set score = scored.score
           from scored
           where s.domain = scored.domain and s.score is distinct from scored.score
           returning 1
         )
    select count(*)::int as n from changed
  `;
  return r!.n;
}
