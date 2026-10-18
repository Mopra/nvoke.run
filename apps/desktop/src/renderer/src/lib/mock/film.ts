/**
 * The cast of the product film (apps/video): one story that holds across every
 * scene. Jamie runs Brightlane, a London studio that builds Shopify stores, and
 * pastes brightlane.co to find independent brands to work with. Every company,
 * person and domain here is made up.
 *
 * Runs with VITE_FILM=1 next to VITE_MOCK=1 (`pnpm --filter @nvoke/desktop film`).
 */
import type { SiteProfile } from '@nvoke/shared';
import type { Opener, SearchInput, Seniority, Verification } from '../types';
import { generateCompany, hashString, rng, type MockCompanySeed } from './data';

/** The search the film starts from the site profile. */
export const FILM_SEARCH = 'Independent Shopify brands in the UK doing £1M to £10M a year';

interface Person {
  first: string;
  last: string;
  title: string;
  seniority: Seniority;
  verification: Verification;
  via: 'page' | 'pattern';
}

interface Brand {
  name: string;
  domain: string;
  location: string;
  fit: number;
  people: Person[];
  /** A fact from the brand's own site and the opening line built on it. Null when there is nothing to build on. */
  opener: { path: string; quote: string; line: string } | null;
}

const founder = (first: string, last: string, title = 'Founder'): Person => ({
  first, last, title, seniority: 'founder', verification: 'valid', via: 'page',
});
const lead = (first: string, last: string, title: string, verification: Verification = 'valid'): Person => ({
  first, last, title, seniority: 'director', verification, via: 'pattern',
});

/** The rows the camera lands on, in the order they appear. */
const BRANDS: Brand[] = [
  {
    name: 'Hollow & Pine',
    domain: 'hollowandpine.co.uk',
    location: 'Bristol',
    fit: 94,
    people: [founder('Hannah', 'Price', 'Founder and CEO'), lead('Tom', 'Okafor', 'Head of Ecommerce')],
    opener: {
      path: '/about',
      quote: 'In March we became a certified B Corp.',
      line: 'Congrats on the B Corp certification. That takes years of quiet work.',
    },
  },
  {
    name: 'Field Day Coffee',
    domain: 'fielddaycoffee.co.uk',
    location: 'Leeds',
    fit: 91,
    people: [founder('Sam', 'Whitfield', 'Co-founder'), lead('Priya', 'Nair', 'Ecommerce Manager')],
    opener: {
      path: '/subscriptions',
      quote: 'Over 4,000 subscribers get a fresh bag every month.',
      line: '4,000 monthly subscribers is a loyal crowd. The checkout should feel that way too.',
    },
  },
  {
    name: 'Saltmarsh Skincare',
    domain: 'saltmarshskin.co.uk',
    location: 'Brighton',
    fit: 89,
    people: [founder('Olivia', 'Grant', 'Founder'), lead('Marcus', 'Hale', 'Head of Growth', 'risky')],
    opener: {
      path: '/news',
      quote: 'Now stocked in 120 Boots stores.',
      line: 'Going from your own site to 120 Boots shelves is a big year.',
    },
  },
  {
    name: 'Kestrel Cycling',
    domain: 'kestrelcycling.co.uk',
    location: 'Manchester',
    fit: 87,
    people: [founder('James', 'Rowe', 'Managing Director')],
    opener: {
      path: '/team',
      quote: 'We grew from 6 to 18 people this year.',
      line: 'Tripling the team in a year means the bikes are selling.',
    },
  },
  {
    name: 'Marlow Knitwear',
    domain: 'marlowknit.co.uk',
    location: 'Edinburgh',
    fit: 86,
    people: [founder('Isla', 'Campbell', 'Founder'), lead('Ewan', 'Fraser', 'Operations Director')],
    opener: {
      path: '/',
      quote: 'Every jumper is knitted in our Scottish mill.',
      line: 'Knitting every jumper in your own mill is a story most stores bury. Yours should lead with it.',
    },
  },
  {
    name: 'Ferro Cookware',
    domain: 'ferrocookware.co.uk',
    location: 'Sheffield',
    fit: 84,
    people: [founder('Daniel', 'Moss', 'Co-founder and CEO'), lead('Grace', 'Ellis', 'Head of Marketing')],
    opener: {
      path: '/about',
      quote: 'Forged in Sheffield since 2016.',
      line: 'Sheffield steel sells itself in person. Online it needs a bit of help.',
    },
  },
  {
    name: 'Little Otter',
    domain: 'littleotterkids.co.uk',
    location: 'London',
    fit: 82,
    people: [founder('Amara', 'Osei', 'Founder')],
    opener: {
      path: '/news',
      quote: 'We just launched in Germany and the Netherlands.',
      line: 'Congrats on launching in Germany and the Netherlands.',
    },
  },
  {
    name: 'Bramble & Rye',
    domain: 'brambleandrye.co.uk',
    location: 'Bath',
    fit: 80,
    people: [founder('Lucy', 'Hart', 'Owner'), lead('Ben', 'Carter', 'Ecommerce Lead', 'catch_all')],
    opener: null,
  },
  {
    name: 'Northbound Supply',
    domain: 'northboundsupply.co.uk',
    location: 'Newcastle',
    fit: 78,
    people: [founder('Callum', 'Reid', 'Founder'), lead('Sophie', 'Lang', 'Head of Ecommerce')],
    opener: {
      path: '/about',
      quote: 'Every jacket is made to last ten winters.',
      line: 'Ten winters is a bold promise. The product pages could make more of it.',
    },
  },
  {
    name: 'Oakhurst Leather',
    domain: 'oakhurstleather.co.uk',
    location: 'Northampton',
    fit: 77,
    people: [founder('Ruth', 'Benson', 'Founder and CEO')],
    opener: {
      path: '/',
      quote: 'Trusted by 30,000 customers since 2014.',
      line: '30,000 customers since 2014 is a base worth building on.',
    },
  },
];

const STEMS = [
  'Wren', 'Harbour', 'Moorland', 'Linden', 'Juniper', 'Copse', 'Larch', 'Thistle', 'Heron', 'Fernhill',
  'Driftwood', 'Ashby', 'Marigold', 'Kiln', 'Orchard', 'Tidal', 'Hazel', 'Quill', 'Rowan', 'Saltire',
];
const KINDS = ['Studio', 'Supply Co', 'Goods', 'Apothecary', 'Roasters', 'Home', 'Outdoors', 'Atelier', 'Botanicals', 'Workshop'];
const TOWNS = ['London', 'Bristol', 'Leeds', 'Brighton', 'Manchester', 'Glasgow', 'Cardiff', 'York', 'Norwich', 'Bath'];

const slug = (text: string): string => text.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '');

/** A hand made brand as a mock company. */
function brandSeed(searchId: string, index: number, b: Brand): MockCompanySeed {
  const website = `https://www.${b.domain}`;
  const emails = b.people.map((p, k) => {
    const local = k === 0 ? p.first.toLowerCase() : `${p.first}.${p.last}`.toLowerCase();
    return {
      id: `${searchId}-e${index}-p${k}`,
      address: `${local}@${b.domain}`,
      kind: 'personal' as const,
      sourceUrl: p.via === 'page' ? `${website}/about` : null,
      person: { firstName: p.first, lastName: p.last, title: p.title, seniority: p.seniority },
      foundVia: p.via,
      confidence: p.verification === 'valid' ? 95 : 50,
    };
  });
  return {
    company: {
      id: `${searchId}-c${index}`,
      name: b.name,
      domain: b.domain,
      website,
      source: 'brave',
      sourceRef: null,
      location: b.location,
      phone: null,
      category: 'Independent Shopify brands',
      fit: b.fit,
    },
    emails,
    verifications: b.people.map((p) => p.verification),
    crawlOutcome: 'done',
    localCrawl: null,
  };
}

/**
 * The film's companies: the hand made brands first on a plain words search,
 * then generated ones renamed to brands with UK domains, so the long tail of
 * the list reads like the head.
 */
export function filmCompany(searchId: string, input: SearchInput, index: number): MockCompanySeed {
  const brand = brandAt(input, index);
  if (brand) return brandSeed(searchId, index, brand);
  const base = generateCompany(searchId, input, index);
  if (input.kind !== 'icp') return base;
  const r = rng(hashString(`film:${searchId}:${index}`));
  const name = `${STEMS[Math.floor(r() * STEMS.length)]} ${KINDS[Math.floor(r() * KINDS.length)]}`;
  const domain = `${slug(name)}${index > 60 ? index : ''}.co.uk`;
  const swap = (text: string): string => text.split(base.company.domain).join(domain);
  return {
    ...base,
    company: { ...base.company, name, domain, website: swap(base.company.website), location: TOWNS[Math.floor(r() * TOWNS.length)]! },
    emails: base.emails.map((e) => ({ ...e, address: swap(e.address), sourceUrl: e.sourceUrl ? swap(e.sourceUrl) : null })),
  };
}

/** The hand made brand a search finds at `index`: in order on a plain words search, by domain or name on a list. */
function brandAt(input: SearchInput, index: number): Brand | undefined {
  if (input.kind === 'icp') return BRANDS[index];
  if (input.kind !== 'domains') return undefined;
  const item = (input.params.items[index % input.params.items.length] ?? '').toLowerCase();
  return BRANDS.find((b) => item.includes(b.domain) || item === b.name.toLowerCase());
}

/** The opener for a hand made brand, or undefined to fall back to the generated one. */
export function filmOpener(index: number, input: SearchInput, at: string): Opener | undefined {
  const brand = brandAt(input, index);
  if (!brand) return undefined;
  if (!brand.opener) return { status: 'none', line: null, sourceUrl: null, quote: null, draftedAt: at };
  return {
    status: 'done',
    line: brand.opener.line,
    sourceUrl: `https://www.${brand.domain}${brand.opener.path}`,
    quote: brand.opener.quote,
    draftedAt: at,
  };
}

/** Brightlane, read from any site the film pastes. */
export function filmSiteProfile(domain: string, at: string): SiteProfile {
  return {
    website: `https://${domain}/`,
    domain,
    profile: {
      name: 'Brightlane',
      summary: 'Brightlane builds fast Shopify stores for independent brands.',
      offer: 'Shopify stores designed, built and run on a monthly plan, with speed and conversion work included.',
      audience: 'Founder led brands on Shopify doing £1M to £10M a year, mostly in the UK.',
      proofPoints: ['60 stores live', 'Conversion up 24% on average after a rebuild', 'Shopify Plus partner'],
      voice: ['fast', 'founder led', 'no lock-in', 'made to sell'],
      language: 'en',
      country: 'gb',
    },
    suggestions: [
      {
        why: 'Your case studies are founder led brands this size, and most of them sell from the UK.',
        search: { kind: 'icp', params: { description: FILM_SEARCH, countries: ['gb'] }, limit: 300 },
      },
      {
        why: 'Three of your clients roast coffee. London has hundreds more.',
        search: { kind: 'local', params: { niche: 'coffee roasters', location: 'London' }, limit: 100 },
      },
      {
        why: 'Slow fashion sells on story, and your stores are built to tell it.',
        search: { kind: 'web', params: { keyword: 'sustainable fashion brand', country: 'gb' }, limit: 100 },
      },
      {
        why: 'New Shopify apps launch every week and look for partners who build stores.',
        search: { kind: 'launches', params: { keyword: 'shopify', days: 30 }, limit: 50 },
      },
    ],
    pages: [`https://${domain}/`, `https://${domain}/about`, `https://${domain}/work`, `https://${domain}/pricing`],
    icon: null,
    image: null,
    createdAt: at,
    updatedAt: at,
  };
}

/** Earlier searches on the list, all finished, so nothing but the film's search runs. */
export const FILM_HISTORY: { input: SearchInput; daysAgo: number }[] = [
  { input: { kind: 'icp', params: { description: FILM_SEARCH, countries: ['gb'] }, limit: 300 }, daysAgo: 0.1 },
  { input: { kind: 'local', params: { niche: 'coffee roasters', location: 'London' }, limit: 100 }, daysAgo: 1 },
  { input: { kind: 'web', params: { keyword: 'sustainable fashion brand', country: 'GB' }, limit: 200 }, daysAgo: 3 },
  { input: { kind: 'launches', params: { keyword: 'shopify', days: 30 }, limit: 50 }, daysAgo: 6 },
];

/** Searches finish this many times faster than the demo default, so a take fits a cut. */
export const FILM_PACE = 3;
