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
    title: 'Bakeries in Lisbon',
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
    name: 'Padaria Alfama',
    domain: 'padariaalfama.pt',
    location: 'Alfama, Lisbon',
    phone: '+351 218 864 211',
    emails: [
      { address: 'ola@padariaalfama.pt', status: 'valid' },
      { address: 'joao.silva@padariaalfama.pt', status: 'valid', personal: true },
      { address: 'rita.silva@padariaalfama.pt', status: 'unknown', personal: true },
    ],
  },
  {
    name: 'Forno do Chiado',
    domain: 'fornodochiado.pt',
    location: 'Chiado, Lisbon',
    phone: '+351 213 425 019',
    emails: [
      { address: 'geral@fornodochiado.pt', status: 'risky' },
      { address: 'encomendas@fornodochiado.pt', status: 'valid' },
    ],
  },
  {
    name: 'Pão & Co Belém',
    domain: 'paoecobelem.pt',
    location: 'Belém, Lisbon',
    phone: '+351 213 627 450',
    emails: [{ address: 'encomendas@paoecobelem.pt', status: 'valid' }],
  },
  {
    name: 'Graça Bakery',
    domain: 'gracabakery.pt',
    location: 'Graça, Lisbon',
    phone: '+351 218 870 336',
    emails: [{ address: 'hello@gracabakery.pt', status: 'valid' }],
  },
  {
    name: 'Campo de Ourique Pão',
    domain: 'campodeouriquepao.pt',
    location: 'Campo de Ourique, Lisbon',
    phone: '+351 213 961 774',
    emails: [{ address: 'info@campodeouriquepao.pt', status: 'catch_all' }],
  },
  {
    name: 'Estrela Bakehouse',
    domain: 'estrelabakehouse.pt',
    location: 'Estrela, Lisbon',
    phone: '+351 213 951 208',
    emails: [
      { address: 'mail@estrelabakehouse.pt', status: 'valid' },
      { address: 'ana.costa@estrelabakehouse.pt', status: 'valid', personal: true },
    ],
  },
  {
    name: 'Padaria do Bairro',
    domain: 'padariadobairro.pt',
    location: 'Bairro Alto, Lisbon',
    phone: '+351 213 470 582',
    emails: [],
  },
  {
    name: 'Príncipe Real Fornos',
    domain: 'principerealfornos.pt',
    location: 'Príncipe Real, Lisbon',
    phone: '+351 213 460 915',
    emails: [{ address: 'ola@principerealfornos.pt', status: 'valid' }],
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
