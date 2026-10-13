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
    title: 'Bakeries in Aarhus',
    status: 'running',
    kind: 'local businesses',
    found: 55,
    crawled: 34,
    caption: '27 of 44 websites crawled',
    emails: 36,
    valid: 15,
    when: 'just now',
  },
  {
    title: 'Dentists in Copenhagen',
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
    title: 'Launches matching "ai"',
    status: 'failed',
    kind: 'new launches, last 7 days',
    found: 100,
    crawled: 75,
    caption: 'Stopped at your monthly email limit.',
    emails: 116,
    valid: 62,
    when: '2 days ago',
  },
  {
    title: '"headless cms" in DE',
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
    title: '"accounting software" in GB',
    status: 'canceled',
    kind: 'web search',
    found: 100,
    crawled: 64,
    caption: '50 companies, 32 crawled',
    emails: 44,
    valid: 31,
    when: '6 days ago',
  },
];

export type MockEmail = { address: string; status: Verification; personal?: boolean };
export type MockCompany = { name: string; domain: string; location: string; phone: string; emails: MockEmail[] };

export const BAKERIES: MockCompany[] = [
  {
    name: 'Holte Surdejsbageriet',
    domain: 'holtesurdejsbageriet.dk',
    location: 'Holte, Aarhus',
    phone: '+45 52 25 81 59',
    emails: [
      { address: 'kontakt@holtesurdejsbageriet.dk', status: 'valid' },
      { address: 'felix.nielsen@holtesurdejsbageriet.dk', status: 'valid', personal: true },
      { address: 'william.nielsen@holtesurdejsbageriet.dk', status: 'unknown', personal: true },
    ],
  },
  {
    name: 'Frederiksberg Bakery',
    domain: 'frederiksbergbakery.dk',
    location: 'Frederiksberg, Aarhus',
    phone: '+45 43 35 16 35',
    emails: [
      { address: 'post@frederiksbergbakery.dk', status: 'risky' },
      { address: 'booking@frederiksbergbakery.dk', status: 'valid' },
    ],
  },
  {
    name: 'Brød & Co Gentofte',
    domain: 'broedcogentofte.dk',
    location: 'Gentofte, Aarhus',
    phone: '+45 75 49 53 80',
    emails: [{ address: 'booking@broedcogentofte.dk', status: 'valid' }],
  },
  {
    name: 'Kastrup Bageri',
    domain: 'kastrupbageri.dk',
    location: 'Kastrup, Aarhus',
    phone: '+45 57 79 72 66',
    emails: [{ address: 'kontakt@kastrupbageri.dk', status: 'valid' }],
  },
  {
    name: 'Charlottenlund Brød & Co',
    domain: 'charlottenlundbroedco.dk',
    location: 'Charlottenlund, Aarhus',
    phone: '+45 92 80 61 37',
    emails: [{ address: 'post@charlottenlundbroedco.dk', status: 'catch_all' }],
  },
  {
    name: 'Valby Bakery',
    domain: 'valbybakery.dk',
    location: 'Valby, Aarhus',
    phone: '+45 28 28 24 25',
    emails: [
      { address: 'mail@valbybakery.dk', status: 'valid' },
      { address: 'ella.larsen@valbybakery.dk', status: 'valid', personal: true },
    ],
  },
  {
    name: 'Christianshavn Bageri',
    domain: 'christianshavnbageri.dk',
    location: 'Christianshavn, Aarhus',
    phone: '+45 24 41 87 77',
    emails: [],
  },
  {
    name: 'Holte Brød & Co',
    domain: 'holtebroedco.dk',
    location: 'Holte, Aarhus',
    phone: '+45 90 54 89 14',
    emails: [{ address: 'kontakt@holtebroedco.dk', status: 'valid' }],
  },
];

export const DENTISTS: MockCompany[] = [
  {
    name: 'Smile Studio Frederiksberg',
    domain: 'smilestudiofrederiksberg.dk',
    location: 'Frederiksberg, Copenhagen',
    phone: '+45 44 66 27 15',
    emails: [
      { address: 'hello@smilestudiofrederiksberg.dk', status: 'valid' },
      { address: 'mail@smilestudiofrederiksberg.dk', status: 'catch_all' },
      { address: 'maja@smilestudiofrederiksberg.dk', status: 'risky', personal: true },
    ],
  },
  {
    name: 'Nordhavn Tandklinik',
    domain: 'nordhavntandklinik.dk',
    location: 'Nordhavn, Copenhagen',
    phone: '+45 77 94 74 82',
    emails: [
      { address: 'booking@nordhavntandklinik.dk', status: 'invalid' },
      { address: 'noah.hansen@nordhavntandklinik.dk', status: 'valid', personal: true },
    ],
  },
  {
    name: 'Dental Sydhavn',
    domain: 'dentalsydhavn.dk',
    location: 'Sydhavn, Copenhagen',
    phone: '+45 66 19 43 85',
    emails: [{ address: 'kontakt@dentalsydhavn.dk', status: 'catch_all' }],
  },
];
