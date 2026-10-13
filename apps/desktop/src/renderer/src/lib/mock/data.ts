/**
 * Deterministic fake companies and emails for the mock transport. Everything
 * derives from a seed, so a search shows the same leads on every poll.
 */
import type { Company, Email, EmailKind, SearchInput, Verification } from '../types';

/** mulberry32: small, fast, good enough for fake data. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const pick = <T>(r: () => number, items: readonly T[]): T => items[Math.floor(r() * items.length)]!;

const DISTRICTS = [
  'Northside', 'Riverside', 'Old Town', 'Midtown', 'Westend', 'Hillcrest', 'Parkview', 'Eastgate',
  'Lakeside', 'Southbank', 'Uptown', 'Greenway', 'Market Square', 'Elm Park', 'Oakridge', 'Bayview',
  'Cedar Hill', 'Mill Lane', 'Canal Street', 'Harbourfront',
];
const WEB_STEMS = [
  'Lumen', 'Strata', 'Cobalt', 'Kite', 'Orbit', 'Harbor', 'Pixel', 'Fable', 'Quarry', 'Tandem', 'North',
  'Juniper', 'Ledger', 'Atlas', 'Bramble', 'Copper', 'Drift', 'Ember', 'Fjord', 'Granite', 'Hollow', 'Indigo',
  'Keystone', 'Lantern', 'Meadow', 'Nimbus', 'Oak', 'Prism', 'Relay', 'Sable', 'Tide', 'Vela', 'Willow',
];
const WEB_SUFFIX = ['Labs', 'HQ', 'Cloud', 'Works', 'Systems', 'Studio', 'Stack', 'Base', 'Kit', ''];
const LAUNCH_STEMS = [
  'Promptly', 'Glide', 'Inkwell', 'Tracewise', 'Shipfast', 'Querybird', 'Notably', 'Loopin', 'Mergely',
  'Sketchpad', 'Formflow', 'Pagecraft', 'Taskmint', 'Clipnote', 'Voxel', 'Brieflet', 'Docsmith', 'Scribe',
];
const FIRST_NAMES = [
  'anna', 'james', 'sofia', 'lucas', 'maria', 'noah', 'emma', 'leo', 'clara', 'oscar', 'laura', 'daniel',
  'mia', 'william', 'ella', 'felix', 'nora', 'victor', 'alma', 'sam',
];
const LAST_NAMES = ['smith', 'garcia', 'silva', 'brown', 'miller', 'costa', 'lee', 'walker', 'santos', 'clark'];
const GENERIC_LOCAL = ['info', 'contact', 'booking', 'mail', 'hello', 'office'];
const GENERIC_WEB = ['info', 'contact', 'hello', 'sales', 'support', 'team'];

const VERIFICATION_WEIGHTS: [Verification, number][] = [
  ['valid', 0.56],
  ['catch_all', 0.14],
  ['risky', 0.1],
  ['invalid', 0.08],
  ['unknown', 0.12],
];

function pickVerification(r: () => number): Verification {
  let roll = r();
  for (const [value, weight] of VERIFICATION_WEIGHTS) {
    if (roll < weight) return value;
    roll -= weight;
  }
  return 'unknown';
}

function slug(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ø/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/å/g, 'aa')
    .replace(/[^a-z0-9]+/g, '');
}

function titleCase(text: string): string {
  return text.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Singular noun used in business names, from a niche like "dentists". */
function nicheNoun(niche: string): string {
  const clean = niche.trim().toLowerCase();
  const map: Record<string, string[]> = {
    dentists: ['Dental', 'Dental Care', 'Family Dentistry', 'Smile Studio'],
    bakeries: ['Bakery', 'Bakehouse', 'Bread & Co', 'Sourdough'],
    architects: ['Architects', 'Studio', 'Architecture', 'Design Office'],
  };
  if (map[clean]) return map[clean].join('|');
  const singular = clean.endsWith('ies') ? `${clean.slice(0, -3)}y` : clean.replace(/s$/, '');
  return [titleCase(singular), `${titleCase(singular)} Studio`, `${titleCase(singular)} & Co`].join('|');
}

export interface MockCompanySeed {
  company: Omit<Company, 'crawlStatus' | 'crawledAt' | 'emails'>;
  emails: Omit<Email, 'checkedAt' | 'verification'>[];
  verifications: Verification[];
  /** Some sites refuse crawling or fail. */
  crawlOutcome: 'done' | 'failed' | 'blocked';
}

export function generateCompany(searchId: string, input: SearchInput, index: number): MockCompanySeed {
  const r = rng(hashString(`${searchId}:${index}`));
  let name: string;
  let tld: string;
  let location: string | null = null;
  let source: string;
  let category: string | null;
  let phone: string | null = null;

  if (input.kind === 'local') {
    const nouns = nicheNoun(input.params.niche).split('|');
    const district = pick(r, DISTRICTS);
    name = r() < 0.5 ? `${district} ${pick(r, nouns)}` : `${pick(r, nouns)} ${district}`;
    const lisbon = /lisbon|lisboa/i.test(input.params.location);
    tld = lisbon ? 'pt' : pick(r, ['com', 'com', 'co']);
    location = `${district}, ${titleCase(input.params.location)}`;
    source = 'osm';
    category = titleCase(input.params.niche.replace(/s$/, ''));
    phone = lisbon
      ? `+351 21 ${Math.floor(100 + r() * 899)} ${Math.floor(1000 + r() * 8999)}`
      : `+1 512 ${Math.floor(200 + r() * 799)} ${Math.floor(1000 + r() * 8999)}`;
  } else if (input.kind === 'web') {
    name = `${pick(r, WEB_STEMS)} ${pick(r, WEB_SUFFIX)}`.trim();
    tld = input.params.country ? input.params.country.toLowerCase() : pick(r, ['com', 'io', 'co']);
    source = 'brave';
    category = input.params.keyword;
  } else {
    name = `${pick(r, LAUNCH_STEMS)}${r() < 0.3 ? ` ${pick(r, ['AI', 'App', 'Pro'])}` : ''}`;
    tld = pick(r, ['com', 'app', 'ai', 'io', 'so']);
    source = r() < 0.6 ? 'product_hunt' : 'show_hn';
    category = input.params.keyword ?? null;
  }

  const domain = `${slug(name)}${index > 40 && r() < 0.4 ? Math.floor(r() * 90 + 10) : ''}.${tld}`;
  const website = `https://${r() < 0.7 ? 'www.' : ''}${domain}`;

  const crawlRoll = r();
  const crawlOutcome = crawlRoll < 0.04 ? 'blocked' : crawlRoll < 0.09 ? 'failed' : 'done';

  const emails: MockCompanySeed['emails'] = [];
  const verifications: Verification[] = [];
  if (crawlOutcome === 'done') {
    const countRoll = r();
    const count = countRoll < 0.22 ? 0 : countRoll < 0.6 ? 1 : countRoll < 0.85 ? 2 : countRoll < 0.95 ? 3 : 4;
    const used = new Set<string>();
    for (let e = 0; e < count; e++) {
      const kind: EmailKind = e === 0 || r() < 0.35 ? 'generic' : 'personal';
      let local: string;
      if (kind === 'generic') {
        local = pick(r, input.kind === 'local' ? GENERIC_LOCAL : GENERIC_WEB);
      } else {
        const first = pick(r, FIRST_NAMES);
        local = r() < 0.5 ? first : `${first}.${pick(r, LAST_NAMES)}`;
      }
      const address = `${local}@${domain}`;
      if (used.has(address)) continue;
      used.add(address);
      const page = kind === 'generic' ? pick(r, ['/', '/contact-us', '/contact', '/about']) : pick(r, ['/team', '/our-team', '/about']);
      emails.push({ id: `${searchId}-e${index}-${e}`, address, kind, sourceUrl: `https://${domain}${page}` });
      verifications.push(pickVerification(r));
    }
  }

  return {
    company: {
      id: `${searchId}-c${index}`,
      name,
      domain,
      website,
      source,
      sourceRef: source === 'osm' ? `node/${Math.floor(r() * 9e9)}` : null,
      location,
      phone,
      category,
    },
    emails,
    verifications,
    crawlOutcome,
  };
}

/** How many companies the fake source yields before running dry. */
export function sourceYield(searchId: string, limit: number): number {
  const r = rng(hashString(`yield:${searchId}`));
  return Math.max(1, Math.round(limit * (0.72 + r() * 0.24)));
}
