// The pure parts of the lead-quality eval (eval-run.ts): seeded sampling,
// metrics from rows, totals and the markdown report. No database, no network.

import type { Verification } from '@nvoke/shared';

// Seeded sampling

/** A 32 bit FNV-1a hash, to turn a label into a seed. */
export function seedOf(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32: a small, fast PRNG. Same seed, same sequence. Returns numbers in [0, 1). */
export function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** Up to n items picked at random without repeats (partial Fisher-Yates). Leaves `items` alone. */
export function sample<T>(items: readonly T[], n: number, rng: () => number): T[] {
  const pool = [...items];
  const count = Math.min(n, pool.length);
  for (let i = 0; i < count; i++) {
    const j = i + Math.floor(rng() * (pool.length - i));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  return pool.slice(0, count);
}

/** Prefers items that pass `preferred`, topping up with the rest when there are too few. */
export function samplePreferring<T>(items: readonly T[], n: number, rng: () => number, preferred: (item: T) => boolean): T[] {
  const first = sample(items.filter(preferred), n, rng);
  if (first.length >= n) return first;
  return [...first, ...sample(items.filter((i) => !preferred(i)), n - first.length, rng)];
}

// Metrics

export interface CompanyRow {
  id: string;
  searchId: string;
  crawlStatus: string;
}

export interface EmailRow {
  companyId: string;
  searchId: string;
  kind: 'generic' | 'personal';
  verification: Verification | null;
  /** A person's name, when the emails table holds one. */
  name: string | null;
  title: string | null;
  /** founder, executive, director, manager or staff (1600_people). */
  seniority: string | null;
  /** page (printed on the site), pattern (built from the domain's pattern) or cache. */
  foundVia: string | null;
}

export interface SearchUsage {
  searchId: string;
  kind: string;
  sourceRequests: number;
  sourceCacheHits: number;
  status: string;
  finishedAt: string | null;
}

export interface EntryMetrics {
  entryId: string;
  /** Minutes from the start of the run until the entry's searches all ended, or until the snapshot. */
  elapsedMinutes: number;
  /** Searches that ended (done, failed or canceled) out of all. */
  searchesEnded: number;
  searches: number;
  companies: number;
  companiesCrawled: number;
  companiesWithEmail: number;
  emails: number;
  personal: number;
  generic: number;
  named: number;
  titled: number;
  decisionMakers: number;
  valid: number;
  /** valid / emails with a verification, 0 when none has one yet. */
  validRate: number;
  catchAll: number;
  unknown: number;
  risky: number;
  invalid: number;
  /** Not checked yet. */
  pending: number;
  validPersonal: number;
  validNamed: number;
  /** Built from the domain's address pattern rather than read on a page. */
  pattern: number;
  validPattern: number;
  braveRequests: number;
  braveCacheHits: number;
  /** As if every page were fetched from Brave: (requests + cache hits) times the price. */
  braveCostUsd: number;
  /** What Brave was actually paid for: requests times the price. */
  bravePaidUsd: number;
  aiCostUsd: number;
  /** (Brave as if uncached + AI) / valid. Null without a valid email. */
  costPerValidUsd: number | null;
}

const DECISION_TITLE =
  /\b(founder|co-?founder|owner|ceo|cto|coo|cfo|cmo|cro|chief|president|managing|director|head of|vp|vice president|partner|principal|geschäftsführer|inhaber|direktør|ejer|indehaver)\b/i;
const DECISION_SENIORITY = new Set(['founder', 'executive', 'director']);

/**
 * Whether the person decides on a purchase: seniority founder, executive or
 * director. The title is read only when the row has no seniority.
 */
export function isDecisionMaker(e: Pick<EmailRow, 'title' | 'seniority'>): boolean {
  if (e.seniority) return DECISION_SENIORITY.has(e.seniority.toLowerCase());
  return !!e.title && DECISION_TITLE.test(e.title);
}

const ENDED = new Set(['done', 'failed', 'canceled']);

export interface MetricsInput {
  entryId: string;
  companies: CompanyRow[];
  emails: EmailRow[];
  searches: SearchUsage[];
  aiCostUsd: number;
  braveCostPer1000Usd: number;
  /** When the run started and when the snapshot was taken. */
  startedAt: Date;
  at: Date;
}

/** An entry's metrics from its rows. Rows of other searches are ignored. */
export function entryMetrics(input: MetricsInput): EntryMetrics {
  const ids = new Set(input.searches.map((s) => s.searchId));
  const companies = input.companies.filter((c) => ids.has(c.searchId));
  const emails = input.emails.filter((e) => ids.has(e.searchId));
  const withEmail = new Set(emails.map((e) => e.companyId));
  const count = (pred: (e: EmailRow) => boolean) => emails.filter(pred).length;
  const checked = count((e) => e.verification !== null);
  const valid = count((e) => e.verification === 'valid');

  const braveSearches = input.searches;
  const braveRequests = braveSearches.reduce((n, s) => n + s.sourceRequests, 0);
  const braveCacheHits = braveSearches.reduce((n, s) => n + s.sourceCacheHits, 0);
  const price = input.braveCostPer1000Usd / 1_000;
  const braveCostUsd = (braveRequests + braveCacheHits) * price;

  const ended = input.searches.filter((s) => ENDED.has(s.status));
  const allEnded = ended.length === input.searches.length && input.searches.length > 0;
  const lastEnd = allEnded ? Math.max(...ended.map((s) => (s.finishedAt ? new Date(s.finishedAt).getTime() : input.at.getTime()))) : input.at.getTime();
  const end = Math.min(lastEnd, input.at.getTime());

  return {
    entryId: input.entryId,
    elapsedMinutes: Math.max(0, (end - input.startedAt.getTime()) / 60_000),
    searchesEnded: ended.length,
    searches: input.searches.length,
    companies: companies.length,
    companiesCrawled: companies.filter((c) => c.crawlStatus !== 'pending').length,
    companiesWithEmail: companies.filter((c) => withEmail.has(c.id)).length,
    emails: emails.length,
    personal: count((e) => e.kind === 'personal'),
    generic: count((e) => e.kind === 'generic'),
    named: count((e) => !!e.name),
    titled: count((e) => !!e.title),
    decisionMakers: count(isDecisionMaker),
    valid,
    validRate: checked > 0 ? valid / checked : 0,
    catchAll: count((e) => e.verification === 'catch_all'),
    unknown: count((e) => e.verification === 'unknown'),
    risky: count((e) => e.verification === 'risky'),
    invalid: count((e) => e.verification === 'invalid'),
    pending: count((e) => e.verification === null),
    validPersonal: count((e) => e.verification === 'valid' && e.kind === 'personal'),
    validNamed: count((e) => e.verification === 'valid' && !!e.name),
    pattern: count((e) => e.foundVia === 'pattern'),
    validPattern: count((e) => e.verification === 'valid' && e.foundVia === 'pattern'),
    braveRequests,
    braveCacheHits,
    braveCostUsd,
    bravePaidUsd: braveRequests * price,
    aiCostUsd: input.aiCostUsd,
    costPerValidUsd: valid > 0 ? (braveCostUsd + input.aiCostUsd) / valid : null,
  };
}

const SUMMED = [
  'searchesEnded',
  'searches',
  'companies',
  'companiesCrawled',
  'companiesWithEmail',
  'emails',
  'personal',
  'generic',
  'named',
  'titled',
  'decisionMakers',
  'valid',
  'catchAll',
  'unknown',
  'risky',
  'invalid',
  'pending',
  'validPersonal',
  'validNamed',
  'pattern',
  'validPattern',
  'braveRequests',
  'braveCacheHits',
  'braveCostUsd',
  'bravePaidUsd',
  'aiCostUsd',
] as const satisfies readonly (keyof EntryMetrics)[];

/** The totals row: counts and costs summed, rates recomputed, elapsed the longest. */
export function totalMetrics(rows: EntryMetrics[]): EntryMetrics {
  const total = { entryId: 'total', elapsedMinutes: 0, validRate: 0, costPerValidUsd: null } as EntryMetrics;
  for (const key of SUMMED) total[key] = rows.reduce((n, r) => n + r[key], 0);
  total.elapsedMinutes = Math.max(0, ...rows.map((r) => r.elapsedMinutes));
  const checked = total.valid + total.catchAll + total.unknown + total.risky + total.invalid;
  total.validRate = checked > 0 ? total.valid / checked : 0;
  total.costPerValidUsd = total.valid > 0 ? (total.braveCostUsd + total.aiCostUsd) / total.valid : null;
  return total;
}

// Report

export interface Snapshot {
  /** The minute mark (15, 30, 60) or the minute the run ended. */
  atMinutes: number;
  /** Taken because the run ended (time up or every search ended), not at a mark. */
  final: boolean;
  entries: EntryMetrics[];
  totals: EntryMetrics;
}

export interface IcpVerdict {
  companyId: string;
  name: string;
  domain: string;
  /** 0 wrong, 1 adjacent, 2 clear fit. */
  fit: number;
  reason: string;
}

export interface EmailVerdict {
  address: string;
  kind: string;
  name: string | null;
  title: string | null;
  company: string;
  domain: string;
  verification: Verification | null;
  yes: boolean;
  reason: string;
}

export interface EntryJudgement {
  entryId: string;
  icp: { verdicts: IcpVerdict[]; meanFit: number | null; clearFitShare: number | null; costUsd: number; error?: string };
  wouldEmail: { verdicts: EmailVerdict[]; yes: number; sampled: number; costUsd: number; error?: string };
}

export interface EvalRun {
  label: string;
  startedAt: string;
  finishedAt: string;
  minutes: number;
  smtpPerMinute: number;
  braveCostPer1000Usd: number;
  database: string;
  /** Which optional person columns the emails table had. */
  personColumns: string[];
  entries: { id: string; intent: string; searches: { id: string; kind: string; params: unknown; limit: number; status: string; error: string | null }[] }[];
  snapshots: Snapshot[];
  brave: { seeded: number; dumped: number };
  judges: { entries: EntryJudgement[]; costUsd: number } | null;
}

const money = (v: number) => `$${v < 1 ? v.toFixed(3) : v.toFixed(2)}`;
const pct = (v: number) => `${Math.round(v * 100)}%`;

function row(m: EntryMetrics): string {
  const cells = [
    m.entryId === 'total' ? '**total**' : m.entryId,
    `${m.elapsedMinutes.toFixed(1)}`,
    `${m.searchesEnded}/${m.searches}`,
    m.companies,
    m.companiesCrawled,
    m.companiesWithEmail,
    m.emails,
    `${m.personal}/${m.generic}`,
    `${m.named}/${m.titled}/${m.decisionMakers}`,
    m.valid,
    pct(m.validRate),
    `${m.catchAll}/${m.unknown + m.risky}/${m.invalid}/${m.pending}`,
    `${m.validPersonal}/${m.validNamed}`,
    `${m.pattern}/${m.validPattern}`,
    `${m.braveRequests}+${m.braveCacheHits}`,
    `${money(m.braveCostUsd)} (${money(m.bravePaidUsd)})`,
    money(m.aiCostUsd),
    m.costPerValidUsd === null ? 'n/a' : money(m.costPerValidUsd),
  ];
  return `| ${cells.join(' | ')} |`;
}

const HEADER = [
  '| entry | min | ended | companies | crawled | w/ email | emails | pers/gen | named/titled/DM | valid | valid rate | catch-all/unk/inv/pending | valid pers/named | pattern/valid | Brave req+hits | Brave $ (paid) | AI $ | $/valid |',
  '|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|',
];

/** One markdown table per snapshot, then the judges and the would-email sample of `nvoke-customers`. */
export function renderReport(run: EvalRun): string {
  const out: string[] = [];
  out.push(`# Eval ${run.label}`);
  out.push('');
  out.push(
    `${run.startedAt.slice(0, 16).replace('T', ' ')} UTC, ${run.minutes} min budget, SMTP ${run.smtpPerMinute}/min, Brave $${run.braveCostPer1000Usd}/1000. ` +
      `Person columns: ${run.personColumns.length ? run.personColumns.join(', ') : 'none'}. Brave cache seeded ${run.brave.seeded}, saved ${run.brave.dumped}.`,
  );
  for (const s of run.snapshots) {
    out.push('');
    out.push(`## ${s.final ? `End, ${s.atMinutes.toFixed(1)} min` : `${s.atMinutes} min`}`);
    out.push('');
    out.push(...HEADER);
    for (const m of s.entries) out.push(row(m));
    out.push(row(s.totals));
  }
  out.push('');
  out.push('Brave $ is as if uncached (requests plus cache hits); paid is what the run cost. AI $ is the pipeline only, judges excluded.');

  if (run.judges) {
    out.push('');
    out.push(`## Judges (${money(run.judges.costUsd)}, not in product cost)`);
    out.push('');
    out.push('| entry | ICP mean fit | clear fit | would email |');
    out.push('|---|--:|--:|--:|');
    for (const j of run.judges.entries) {
      const icp = j.icp.error ? `error: ${j.icp.error}` : j.icp.meanFit === null ? 'n/a' : j.icp.meanFit.toFixed(2);
      const share = j.icp.clearFitShare === null ? 'n/a' : `${pct(j.icp.clearFitShare)} of ${j.icp.verdicts.length}`;
      const would = j.wouldEmail.error ? `error: ${j.wouldEmail.error}` : `${j.wouldEmail.yes}/${j.wouldEmail.sampled}`;
      out.push(`| ${j.entryId} | ${icp} | ${share} | ${would} |`);
    }
    const dogfood = run.judges.entries.find((j) => j.entryId === 'nvoke-customers');
    if (dogfood && dogfood.wouldEmail.verdicts.length > 0) {
      out.push('');
      out.push('### Would email: nvoke-customers');
      out.push('');
      out.push('| | address | kind | verification | company | why |');
      out.push('|---|---|---|---|---|---|');
      for (const v of dogfood.wouldEmail.verdicts) {
        const who = [v.name, v.title].filter(Boolean).join(', ');
        const cell = (s: string) => s.replace(/\|/g, '/').replace(/\s+/g, ' ');
        out.push(
          `| ${v.yes ? 'yes' : 'no'} | ${v.address}${who ? ` (${cell(who)})` : ''} | ${v.kind} | ${v.verification ?? 'pending'} | ${cell(v.company)} (${v.domain}) | ${cell(v.reason)} |`,
        );
      }
    }
  }
  return out.join('\n');
}

/** The minute marks a run of `minutes` snapshots at. */
export function snapshotMarks(minutes: number, marks: readonly number[] = [15, 30, 60]): number[] {
  return marks.filter((m) => m < minutes);
}
