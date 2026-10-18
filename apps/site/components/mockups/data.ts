// Demo data for the app mockups. Mirrors the desktop app's mock transport, so
// the screens on the site look like the app on its demo account.

export type Verification = 'valid' | 'catch_all' | 'risky' | 'invalid' | 'unknown';
export type SearchStatus = 'running' | 'done' | 'failed' | 'canceled';

export type MockSearch = {
  title: string;
  status: SearchStatus;
  kind: string;
  /** 0 to 100: companies found, as a share of the bar. */
  found: number;
  /** 0 to 100: companies crawled. */
  crawled: number;
  caption: string;
  emails: number;
  valid: number;
  when: string;
};

export const SEARCHES: MockSearch[] = [
  {
    title: 'Shopify agencies in the UK with 5 to 30 people',
    status: 'running',
    kind: 'describe your customer',
    found: 55,
    crawled: 34,
    caption: '27 of 44 websites read',
    emails: 36,
    valid: 15,
    when: 'just now',
  },
  {
    title: 'Dentists in Austin',
    status: 'done',
    kind: 'local businesses',
    found: 100,
    crawled: 100,
    caption: '75 companies, 75 crawled',
    emails: 83,
    valid: 46,
    when: 'yesterday',
  },
  {
    title: 'B2B SaaS startups hiring their first sales rep',
    status: 'done',
    kind: 'describe your customer',
    found: 100,
    crawled: 100,
    caption: '212 companies, 212 crawled',
    emails: 268,
    valid: 171,
    when: '2 days ago',
  },
  {
    title: '"headless cms" in US',
    status: 'done',
    kind: 'web search',
    found: 100,
    crawled: 100,
    caption: '752 companies, 752 crawled',
    emails: 903,
    valid: 512,
    when: '3 days ago',
  },
  {
    title: 'Launches matching "ai"',
    status: 'done',
    kind: 'new launches, last 7 days',
    found: 100,
    crawled: 100,
    caption: '96 companies, 96 crawled',
    emails: 116,
    valid: 62,
    when: '6 days ago',
  },
];

export type MockEmail = {
  address: string;
  status: Verification;
  personal?: boolean;
  /** A named person, as a people search lists them. */
  name?: string;
  title?: string;
  decisionMaker?: boolean;
};
export type MockCompany = {
  name: string;
  domain: string;
  location: string;
  phone: string;
  /** 0 to 100, judged from the company's own site. People searches only. */
  fit?: number;
  emails: MockEmail[];
};

const person = (name: string, title: string, address: string, status: Verification, decisionMaker = false): MockEmail => ({
  address,
  status,
  personal: true,
  name,
  title,
  decisionMaker,
});

export const AGENCIES: MockCompany[] = [
  {
    name: 'Northwind Commerce',
    domain: 'northwindcommerce.co.uk',
    location: 'Manchester',
    phone: '+44 161 496 0732',
    fit: 92,
    emails: [
      person('Hannah Reid', 'Founder and CEO', 'hannah@northwindcommerce.co.uk', 'valid', true),
      person('Tom Ashworth', 'Head of Growth', 'tom.ashworth@northwindcommerce.co.uk', 'valid'),
    ],
  },
  {
    name: 'Bramble & Co',
    domain: 'brambleandco.com',
    location: 'Bristol',
    phone: '+44 117 496 0281',
    fit: 88,
    emails: [person('James Okafor', 'Managing Director', 'james@brambleandco.com', 'valid', true)],
  },
  {
    name: 'Fieldwork Digital',
    domain: 'fieldworkdigital.co.uk',
    location: 'Leeds',
    phone: '+44 113 496 0915',
    fit: 81,
    emails: [
      person('Sophie Turner', 'Co-founder', 'sophie@fieldworkdigital.co.uk', 'catch_all', true),
      person('Ravi Patel', 'Lead Shopify Developer', 'ravi@fieldworkdigital.co.uk', 'valid'),
    ],
  },
  {
    name: 'Kiln Studio',
    domain: 'kilnstudio.co.uk',
    location: 'London',
    phone: '+44 20 7946 0418',
    fit: 77,
    emails: [person('Emily Clarke', 'Partner', 'emily@kilnstudio.co.uk', 'valid', true)],
  },
  {
    name: 'Harbour Lane',
    domain: 'harbourlane.agency',
    location: 'Brighton',
    phone: '+44 1632 960 027',
    fit: 74,
    emails: [person('Callum Fraser', 'Founder', 'callum@harbourlane.agency', 'risky', true)],
  },
  {
    name: 'Copperline',
    domain: 'copperline.io',
    location: 'Edinburgh',
    phone: '+44 131 496 0603',
    fit: 69,
    emails: [],
  },
  {
    name: 'Tandem Commerce',
    domain: 'tandemcommerce.co.uk',
    location: 'Birmingham',
    phone: '+44 121 496 0350',
    fit: 66,
    emails: [person('Priya Shah', 'Client Services Director', 'priya.shah@tandemcommerce.co.uk', 'valid', true)],
  },
  {
    name: 'Lantern Works',
    domain: 'lanternworks.co.uk',
    location: 'Glasgow',
    phone: '+44 141 496 0177',
    fit: 61,
    emails: [person('Ollie Grant', 'Owner', 'ollie@lanternworks.co.uk', 'valid', true)],
  },
];

export const DENTISTS: MockCompany[] = [
  {
    name: 'Smile Studio South Congress',
    domain: 'smilestudiosoco.com',
    location: 'South Congress, Austin',
    phone: '+1 512 555 0142',
    emails: [
      { address: 'hello@smilestudiosoco.com', status: 'valid' },
      { address: 'mail@smilestudiosoco.com', status: 'catch_all' },
      { address: 'maya@smilestudiosoco.com', status: 'risky', personal: true },
    ],
  },
  {
    name: 'Zilker Dental',
    domain: 'zilkerdental.com',
    location: 'Zilker, Austin',
    phone: '+1 512 555 0187',
    emails: [
      { address: 'booking@zilkerdental.com', status: 'invalid' },
      { address: 'noah.hayes@zilkerdental.com', status: 'valid', personal: true },
    ],
  },
  {
    name: 'Mueller Family Dentistry',
    domain: 'muellerfamilydental.com',
    location: 'Mueller, Austin',
    phone: '+1 512 555 0119',
    emails: [{ address: 'contact@muellerfamilydental.com', status: 'catch_all' }],
  },
];
