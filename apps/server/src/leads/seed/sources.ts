// Free lists of company domains for the company seed
// (docs/research/company-seed.md). The default is the Majestic Million: the
// million registrable domains with the most referring subnets, rebuilt daily
// at one stable address, a plain CSV, licensed CC BY 3.0 (commercial use
// allowed, credit Majestic: https://majestic.com/reports/majestic-million).
// Tranco was turned down: its default list mixes in Cloudflare Radar, which
// is CC BY-NC (no commercial use). Common Crawl's web graph ranks (free under
// the Common Crawl terms of use) reach deeper into small companies but are
// gigabytes per release at a new address each time, so they are read from a
// file the operator downloaded (`cli seed file`), in the same parser.

import { normalizeDomain, registrableDomain } from '../domain.js';

export interface SeedSource {
  /** Where the list is downloaded at run time (the CLI only, never in tests). */
  url: string;
  /** Ranks skipped by default: the head of a popularity list is platforms, media and infrastructure. */
  skipTop: number;
  licence: string;
}

export const SEED_SOURCES: Record<string, SeedSource> = {
  majestic: {
    url: 'https://downloads.majestic.com/majestic_million.csv',
    skipTop: 10_000,
    licence: 'Majestic Million, CC BY 3.0 (https://majestic.com/reports/majestic-million)',
  },
};

export interface SeedEntry {
  /** Registrable domain, lowercase, punycode. */
  domain: string;
  /** Rank in the list, 1 is first. */
  rank: number;
}

/**
 * A line parser for the list formats seen in the wild, stateful so a header
 * line sets the columns of the rows after it:
 * - CSV with a header naming a Domain column and optionally a rank column
 *   (Majestic: GlobalRank,TldRank,Domain,TLD,...).
 * - Common Crawl web graph ranks: tab separated, a "#" header, the host or
 *   domain reversed in a "*_rev" column ("com.example"), the harmonic
 *   centrality position first.
 * - "rank,domain" without a header (Tranco's format).
 * - One domain or address per line, ranked by line.
 * Returns null for headers, comments and lines without a public domain.
 */
export function seedParser(): (line: string) => SeedEntry | null {
  let row = 0;
  let csv: { domain: number; rank: number } | null = null;
  let tsv: { domain: number; rank: number } | null = null;
  return (raw) => {
    const line = raw.trim();
    if (!line) return null;
    if (line.startsWith('#')) {
      const cols = line.split(/\t/).map((c) => c.replace(/^#/, '').trim().toLowerCase());
      const domain = cols.findIndex((c) => c.endsWith('_rev'));
      if (domain >= 0) tsv = { domain, rank: Math.max(0, cols.findIndex((c) => c.endsWith('_pos'))) };
      return null;
    }
    row++;
    let name: string | undefined;
    let rank = row;
    if (tsv) {
      const cols = line.split(/\t/);
      name = cols[tsv.domain]?.split('.').reverse().join('.');
      rank = Number(cols[tsv.rank]) || row;
    } else if (line.includes(',')) {
      const cols = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
      if (!csv) {
        const lower = cols.map((c) => c.toLowerCase());
        const domain = lower.indexOf('domain');
        if (domain >= 0) {
          csv = { domain, rank: lower.findIndex((c) => c === 'globalrank' || c === 'rank') };
          row--;
          return null;
        }
        // No header: "rank,domain".
        csv = /^\d+$/.test(cols[0] ?? '') ? { domain: 1, rank: 0 } : { domain: 0, rank: -1 };
      }
      name = cols[csv.domain];
      if (csv.rank >= 0) rank = Number(cols[csv.rank]) || row;
    } else {
      name = line.split(/\s/)[0];
    }
    const host = name ? normalizeDomain(name.includes('@') ? name.slice(name.lastIndexOf('@') + 1) : name) : null;
    return host ? { domain: registrableDomain(host), rank } : null;
  };
}

/** The entries of a list's lines, in order. */
export async function* seedEntries(lines: AsyncIterable<string> | Iterable<string>): AsyncGenerator<SeedEntry> {
  const parse = seedParser();
  for await (const line of lines) {
    const entry = parse(line);
    if (entry) yield entry;
  }
}
