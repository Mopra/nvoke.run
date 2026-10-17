/**
 * Deterministic fake companies and emails for the mock transport. Everything
 * derives from a seed, so a search shows the same leads on every poll.
 */
import { itemDomain, type SiteProfile } from '@nvoke/shared';
import type { Company, Email, EmailKind, Opener, SearchInput, Verification } from '../types';

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
  company: Omit<Company, 'crawlStatus' | 'crawledAt' | 'localCrawl' | 'emails' | 'opener'>;
  emails: Omit<Email, 'checkedAt' | 'verification'>[];
  verifications: Verification[];
  /** Some sites refuse crawling, need JavaScript or fail. */
  crawlOutcome: 'done' | 'failed' | 'blocked' | 'refused' | 'js_only';
  /** A refused or JS-only site the desktop read (or is reading) itself. */
  localCrawl: Company['localCrawl'];
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
  } else if (input.kind === 'domains') {
    // The list as the user gave it: domains stay, names get a made up website.
    const item = input.params.items[index % input.params.items.length] ?? 'acme.com';
    const given = itemDomain(item);
    name = given ? titleCase(given.split('.')[0]!.replace(/-/g, ' ')) : item;
    tld = given ? given.slice(given.indexOf('.') + 1) : pick(r, ['com', 'dk', 'io']);
    source = given ? 'list' : 'brave';
    category = null;
  } else {
    name = `${pick(r, LAUNCH_STEMS)}${r() < 0.3 ? ` ${pick(r, ['AI', 'App', 'Pro'])}` : ''}`;
    tld = pick(r, ['com', 'app', 'ai', 'io', 'so']);
    source = r() < 0.6 ? 'product_hunt' : 'show_hn';
    category = input.params.keyword ?? null;
  }

  const listed = input.kind === 'domains' ? itemDomain(input.params.items[index % input.params.items.length] ?? '') : null;
  const domain = listed ?? `${slug(name)}${index > 40 && r() < 0.4 ? Math.floor(r() * 90 + 10) : ''}.${tld}`;
  const website = `https://${r() < 0.7 ? 'www.' : ''}${domain}`;

  const crawlRoll = r();
  const crawlOutcome =
    crawlRoll < 0.03 ? 'blocked' : crawlRoll < 0.07 ? 'refused' : crawlRoll < 0.1 ? 'js_only' : crawlRoll < 0.13 ? 'failed' : 'done';
  const localRoll = r();
  const localCrawl: Company['localCrawl'] =
    crawlOutcome !== 'refused' && crawlOutcome !== 'js_only' ? null : localRoll < 0.5 ? 'done' : localRoll < 0.7 ? 'claimed' : null;

  const emails: MockCompanySeed['emails'] = [];
  const verifications: Verification[] = [];
  if (crawlOutcome === 'done' || localCrawl === 'done') {
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
    localCrawl,
  };
}

/** A fact a company's own page could hold, and the first line Claude would build on it. */
const OPENER_FACTS: { path: string; quote: (n: number, c: MockCompanySeed['company']) => string; line: (n: number, c: MockCompanySeed['company']) => string }[] = [
  {
    path: '/about',
    quote: (n) => `Family owned and run since ${2026 - 8 - (n % 30)}.`,
    line: (n) => `${8 + (n % 30)} years as a family run business is a long stretch, and your about page wears it well.`,
  },
  {
    path: '/team',
    quote: (n) => `Our team grew to ${6 + (n % 19)} people this year.`,
    line: (n) => `Going to ${6 + (n % 19)} people in one year means the hiring went well.`,
  },
  {
    path: '/news',
    quote: (_n, c) => `We just opened our second location${c.location ? ` in ${c.location.split(',')[0]}` : ''}.`,
    line: (_n, c) => `Congrats on the second location${c.location ? ` in ${c.location.split(',')[0]}` : ''}.`,
  },
  {
    path: '/pricing',
    quote: () => 'Every plan includes onboarding at no extra cost.',
    line: () => 'Free onboarding on every plan takes the risk out of switching, which is rare to see spelled out.',
  },
  {
    path: '/',
    quote: (n) => `Trusted by ${(3 + (n % 40)) * 10} customers across the region.`,
    line: (n, c) => `${(3 + (n % 40)) * 10} customers is a solid base for ${c.name} to build on.`,
  },
  {
    path: '/services',
    quote: () => 'Same day appointments, six days a week.',
    line: () => 'Same day appointments six days a week must keep the calendar full.',
  },
];

/** The opener Claude would draft for a company: a line from one of its pages, or now and then nothing to build on. */
export function mockOpener(seed: MockCompanySeed['company'], index: number, at: string): Opener {
  const r = rng(hashString(`opener:${seed.id}`));
  if (r() < 0.12) return { status: 'none', line: null, sourceUrl: null, quote: null, draftedAt: at };
  const fact = pick(r, OPENER_FACTS);
  return {
    status: 'done',
    line: fact.line(index, seed),
    sourceUrl: `${seed.website.replace(/\/$/, '')}${fact.path}`,
    quote: fact.quote(index, seed),
    draftedAt: at,
  };
}

/** How many companies the fake source yields before running dry. */
export function sourceYield(searchId: string, limit: number): number {
  const r = rng(hashString(`yield:${searchId}`));
  return Math.max(1, Math.round(limit * (0.72 + r() * 0.24)));
}

/** Country and language a TLD suggests, for the demo profile. */
const TLD_LOCALE: Record<string, { country: string; language: string; city: string; city2: string }> = {
  dk: { country: 'dk', language: 'da', city: 'Copenhagen', city2: 'Aarhus' },
  se: { country: 'se', language: 'sv', city: 'Stockholm', city2: 'Gothenburg' },
  no: { country: 'no', language: 'no', city: 'Oslo', city2: 'Bergen' },
  de: { country: 'de', language: 'de', city: 'Berlin', city2: 'Hamburg' },
  uk: { country: 'gb', language: 'en', city: 'London', city2: 'Manchester' },
};

/**
 * A plausible profile for any site: a small studio that builds booking
 * websites for clinics, named after the domain, with five suggestions across
 * the search kinds. Each `search` is a valid `POST /v1/searches` body.
 */
export function mockSiteProfile(domain: string, at: string): SiteProfile {
  const label = domain.split('.')[0] ?? domain;
  const name = label
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
  const locale = TLD_LOCALE[domain.split('.').at(-1) ?? ''];
  const city = locale?.city ?? 'Austin';
  const city2 = locale?.city2 ?? 'Denver';
  const country = locale?.country ?? null;
  return {
    website: `https://${domain}/`,
    domain,
    profile: {
      name,
      summary: `${name} designs and runs booking websites for dental and physio clinics.`,
      offer: 'Fast clinic websites with online booking, reviews and local search set up, on a monthly plan with no lock-in.',
      audience: `Owner run dental and physiotherapy clinics with 3 to 20 staff, mostly around ${city}.`,
      proofPoints: ['42 clinics live', 'Bookings up 31% on average in the first year', 'Webflow Enterprise partner'],
      voice: ['calm', 'no lock-in', 'booked solid', 'made for clinics'],
      language: locale?.language ?? 'en',
      country,
    },
    suggestions: [
      {
        why: `Your case studies are clinics like these, and ${city} is where most of them sit.`,
        search: { kind: 'local', params: { niche: 'dental clinics', location: city }, limit: 100 },
      },
      {
        why: 'Physio clinics book by the hour too, and your site already shows two of them.',
        search: { kind: 'local', params: { niche: 'physiotherapists', location: city2 }, limit: 100 },
      },
      {
        why: 'Private clinics that sell treatments online need booking that converts.',
        search: { kind: 'web', params: { keyword: 'private dental clinic online booking', ...(country ? { country } : {}) }, limit: 100 },
      },
      {
        why: 'New booking and practice tools launch every week and need a site that sells them.',
        search: { kind: 'launches', params: { keyword: 'booking', days: 30 }, limit: 50 },
      },
      {
        why: 'Groups your site names as partners. Each runs several clinics.',
        search: { kind: 'domains', params: { items: ['colosseumdental.com', 'smile.dk', 'tandlaegen.dk', 'fysioterapeuten.dk'] } },
      },
    ],
    pages: [`https://${domain}/`, `https://${domain}/about`, `https://${domain}/pricing`, `https://${domain}/cases`],
    // The mock never reaches the network, so no pictures.
    icon: null,
    image: null,
    createdAt: at,
    updatedAt: at,
  };
}
