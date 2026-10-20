// The country gate (docs/sending/plan.md, "Legal"): where a recipient sits,
// whether nvoke may write to them at all, and which timezone their working
// hours are in. The country comes from the company's location (free text
// from a source: "Austin, TX", "Vej 2, 2100 København", "Berlin, Germany"),
// else from a country code top level domain. Pure.

import { BLOCKED_COUNTRIES } from '@nvoke/shared';

const CODES = new Set(
  'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'.split(' '),
);

/** Country code domains sold as generic names (.io, .ai, .co): they say nothing about where a company is. */
const GENERIC_CCTLDS = new Set(['ai', 'am', 'cc', 'co', 'fm', 'gg', 'io', 'ly', 'me', 'nu', 'sh', 'so', 'tk', 'to', 'tv', 'vc', 'ws', 'xyz', 'gd', 'la', 'ac', 'bz', 'dj', 'ms', 'vg', 'cx', 'im', 'mu', 'st', 'af']);

/** Names a country goes by besides its English one, lowercased and without accents. */
const COUNTRY_ALIASES: Record<string, string> = {
  usa: 'US', 'u.s.': 'US', 'u.s.a.': 'US', 'united states of america': 'US', america: 'US',
  uk: 'GB', 'u.k.': 'GB', england: 'GB', scotland: 'GB', wales: 'GB', 'northern ireland': 'GB', 'great britain': 'GB', britain: 'GB',
  deutschland: 'DE', allemagne: 'DE', alemania: 'DE', tyskland: 'DE', duitsland: 'DE', germania: 'DE',
  danmark: 'DK', danemark: 'DK', dinamarca: 'DK', danemarken: 'DK', 'daenemark': 'DK', denemarken: 'DK',
  sverige: 'SE', schweden: 'SE', suede: 'SE', suecia: 'SE', zweden: 'SE',
  norge: 'NO', noreg: 'NO', norwegen: 'NO', norvege: 'NO', noruega: 'NO',
  suomi: 'FI', finnland: 'FI', finlande: 'FI',
  island: 'IS', 'ísland': 'IS',
  nederland: 'NL', holland: 'NL', 'the netherlands': 'NL', niederlande: 'NL', 'pays-bas': 'NL', 'paises bajos': 'NL',
  belgie: 'BE', belgique: 'BE', belgien: 'BE',
  espana: 'ES', spanien: 'ES', espagne: 'ES',
  italia: 'IT', italien: 'IT', italie: 'IT',
  osterreich: 'AT', oesterreich: 'AT', autriche: 'AT',
  schweiz: 'CH', suisse: 'CH', svizzera: 'CH', suiza: 'CH',
  polska: 'PL', polen: 'PL', pologne: 'PL',
  cesko: 'CZ', 'czech republic': 'CZ', 'ceska republika': 'CZ',
  eire: 'IE', 'republic of ireland': 'IE',
  frankreich: 'FR', frankrike: 'FR', frankrig: 'FR', francia: 'FR', frankrijk: 'FR',
  portugal: 'PT', brasil: 'BR', mexico: 'MX', 'méxico': 'MX', turkiye: 'TR', turkey: 'TR',
  uae: 'AE', 'u.a.e.': 'AE', emirates: 'AE', 'south korea': 'KR', korea: 'KR', 'republic of korea': 'KR',
  russia: 'RU', 'russian federation': 'RU', 'hong kong sar': 'HK', 'hong kong': 'HK', taiwan: 'TW',
  vietnam: 'VN', 'viet nam': 'VN', 'ivory coast': 'CI', "cote d'ivoire": 'CI', 'czech': 'CZ', magyarorszag: 'HU', hellas: 'GR', ellada: 'GR',
};

/** Cities a company location often names alone, lowercased and without accents. */
const CITIES: Record<string, string> = {
  // Denmark and Germany first: the blocked countries are the ones that must not slip through.
  kobenhavn: 'DK', copenhagen: 'DK', aarhus: 'DK', arhus: 'DK', odense: 'DK', aalborg: 'DK', esbjerg: 'DK', frederiksberg: 'DK', randers: 'DK', kolding: 'DK', horsens: 'DK', vejle: 'DK', roskilde: 'DK', herning: 'DK', silkeborg: 'DK', naestved: 'DK', hellerup: 'DK', lyngby: 'DK', 'kongens lyngby': 'DK', helsingor: 'DK', hillerod: 'DK', svendborg: 'DK', viborg: 'DK', holstebro: 'DK', fredericia: 'DK', sonderborg: 'DK', haderslev: 'DK', skanderborg: 'DK', ballerup: 'DK', taastrup: 'DK', glostrup: 'DK', gentofte: 'DK',
  berlin: 'DE', hamburg: 'DE', munchen: 'DE', muenchen: 'DE', munich: 'DE', koln: 'DE', koeln: 'DE', cologne: 'DE', frankfurt: 'DE', 'frankfurt am main': 'DE', stuttgart: 'DE', dusseldorf: 'DE', duesseldorf: 'DE', leipzig: 'DE', dortmund: 'DE', essen: 'DE', bremen: 'DE', dresden: 'DE', hannover: 'DE', hanover: 'DE', nurnberg: 'DE', nuernberg: 'DE', nuremberg: 'DE', duisburg: 'DE', bochum: 'DE', wuppertal: 'DE', bielefeld: 'DE', bonn: 'DE', munster: 'DE', muenster: 'DE', karlsruhe: 'DE', mannheim: 'DE', augsburg: 'DE', wiesbaden: 'DE', mainz: 'DE', kiel: 'DE', freiburg: 'DE', heidelberg: 'DE', potsdam: 'DE', rostock: 'DE', lubeck: 'DE', luebeck: 'DE', aachen: 'DE', braunschweig: 'DE', chemnitz: 'DE', magdeburg: 'DE', erfurt: 'DE', regensburg: 'DE', ulm: 'DE', darmstadt: 'DE', gottingen: 'DE', goettingen: 'DE', wolfsburg: 'DE', jena: 'DE',
  london: 'GB', manchester: 'GB', birmingham: 'GB', edinburgh: 'GB', glasgow: 'GB', bristol: 'GB', leeds: 'GB', liverpool: 'GB', cardiff: 'GB', belfast: 'GB', cambridge: 'GB', oxford: 'GB', brighton: 'GB', nottingham: 'GB', sheffield: 'GB', newcastle: 'GB',
  stockholm: 'SE', gothenburg: 'SE', goteborg: 'SE', malmo: 'SE', uppsala: 'SE',
  oslo: 'NO', bergen: 'NO', trondheim: 'NO', stavanger: 'NO',
  helsinki: 'FI', espoo: 'FI', tampere: 'FI', reykjavik: 'IS',
  amsterdam: 'NL', rotterdam: 'NL', utrecht: 'NL', 'the hague': 'NL', 'den haag': 'NL', eindhoven: 'NL', groningen: 'NL',
  brussels: 'BE', bruxelles: 'BE', brussel: 'BE', antwerp: 'BE', antwerpen: 'BE', ghent: 'BE', gent: 'BE',
  paris: 'FR', lyon: 'FR', marseille: 'FR', toulouse: 'FR', bordeaux: 'FR', lille: 'FR', nantes: 'FR',
  madrid: 'ES', barcelona: 'ES', valencia: 'ES', seville: 'ES', sevilla: 'ES', malaga: 'ES', bilbao: 'ES',
  lisbon: 'PT', lisboa: 'PT', porto: 'PT',
  rome: 'IT', roma: 'IT', milan: 'IT', milano: 'IT', turin: 'IT', torino: 'IT', naples: 'IT', napoli: 'IT', florence: 'IT', firenze: 'IT', bologna: 'IT',
  vienna: 'AT', wien: 'AT', graz: 'AT', salzburg: 'AT', linz: 'AT', innsbruck: 'AT',
  zurich: 'CH', geneva: 'CH', geneve: 'CH', genf: 'CH', basel: 'CH', bern: 'CH', lausanne: 'CH', zug: 'CH',
  dublin: 'IE', cork: 'IE', galway: 'IE',
  warsaw: 'PL', warszawa: 'PL', krakow: 'PL', wroclaw: 'PL', gdansk: 'PL', poznan: 'PL',
  prague: 'CZ', praha: 'CZ', brno: 'CZ', budapest: 'HU', bucharest: 'RO', bucuresti: 'RO', sofia: 'BG', athens: 'GR', tallinn: 'EE', riga: 'LV', vilnius: 'LT', luxembourg: 'LU', kyiv: 'UA', kiev: 'UA', istanbul: 'TR', ankara: 'TR',
  'new york': 'US', 'new york city': 'US', nyc: 'US', 'san francisco': 'US', 'los angeles': 'US', chicago: 'US', seattle: 'US', boston: 'US', austin: 'US', denver: 'US', miami: 'US', atlanta: 'US', 'silicon valley': 'US', 'bay area': 'US', 'palo alto': 'US', 'san jose': 'US', 'san diego': 'US', dallas: 'US', houston: 'US', phoenix: 'US', philadelphia: 'US', 'washington dc': 'US', 'washington, d.c.': 'US', brooklyn: 'US', portland: 'US', minneapolis: 'US', nashville: 'US', 'salt lake city': 'US', 'las vegas': 'US', detroit: 'US', pittsburgh: 'US',
  toronto: 'CA', vancouver: 'CA', montreal: 'CA', calgary: 'CA', ottawa: 'CA', edmonton: 'CA', winnipeg: 'CA', halifax: 'CA', 'quebec city': 'CA',
  sydney: 'AU', melbourne: 'AU', brisbane: 'AU', perth: 'AU', adelaide: 'AU', canberra: 'AU', hobart: 'AU', darwin: 'AU', 'gold coast': 'AU',
  auckland: 'NZ', wellington: 'NZ', christchurch: 'NZ',
  singapore: 'SG', tokyo: 'JP', osaka: 'JP', seoul: 'KR', beijing: 'CN', shanghai: 'CN', shenzhen: 'CN', mumbai: 'IN', bangalore: 'IN', bengaluru: 'IN', delhi: 'IN', 'new delhi': 'IN', hyderabad: 'IN', pune: 'IN', chennai: 'IN', dubai: 'AE', 'abu dhabi': 'AE', 'tel aviv': 'IL', jerusalem: 'IL',
  'sao paulo': 'BR', 'rio de janeiro': 'BR', 'mexico city': 'MX', 'ciudad de mexico': 'MX', 'buenos aires': 'AR', santiago: 'CL', bogota: 'CO', lima: 'PE',
  'cape town': 'ZA', johannesburg: 'ZA', lagos: 'NG', nairobi: 'KE', cairo: 'EG',
  'kuala lumpur': 'MY', bangkok: 'TH', jakarta: 'ID', manila: 'PH', 'ho chi minh city': 'VN', hanoi: 'VN', taipei: 'TW',
};

// United States, Canada and Australia regions: code, then full name, then the zone.
const US_STATES: [string, string, string][] = [
  ['AL', 'alabama', 'America/Chicago'], ['AK', 'alaska', 'America/Anchorage'], ['AZ', 'arizona', 'America/Phoenix'], ['AR', 'arkansas', 'America/Chicago'],
  ['CA', 'california', 'America/Los_Angeles'], ['CO', 'colorado', 'America/Denver'], ['CT', 'connecticut', 'America/New_York'], ['DE', 'delaware', 'America/New_York'],
  ['DC', 'district of columbia', 'America/New_York'], ['FL', 'florida', 'America/New_York'], ['GA', 'georgia', 'America/New_York'], ['HI', 'hawaii', 'Pacific/Honolulu'],
  ['ID', 'idaho', 'America/Boise'], ['IL', 'illinois', 'America/Chicago'], ['IN', 'indiana', 'America/Indiana/Indianapolis'], ['IA', 'iowa', 'America/Chicago'],
  ['KS', 'kansas', 'America/Chicago'], ['KY', 'kentucky', 'America/New_York'], ['LA', 'louisiana', 'America/Chicago'], ['ME', 'maine', 'America/New_York'],
  ['MD', 'maryland', 'America/New_York'], ['MA', 'massachusetts', 'America/New_York'], ['MI', 'michigan', 'America/Detroit'], ['MN', 'minnesota', 'America/Chicago'],
  ['MS', 'mississippi', 'America/Chicago'], ['MO', 'missouri', 'America/Chicago'], ['MT', 'montana', 'America/Denver'], ['NE', 'nebraska', 'America/Chicago'],
  ['NV', 'nevada', 'America/Los_Angeles'], ['NH', 'new hampshire', 'America/New_York'], ['NJ', 'new jersey', 'America/New_York'], ['NM', 'new mexico', 'America/Denver'],
  ['NY', 'new york', 'America/New_York'], ['NC', 'north carolina', 'America/New_York'], ['ND', 'north dakota', 'America/Chicago'], ['OH', 'ohio', 'America/New_York'],
  ['OK', 'oklahoma', 'America/Chicago'], ['OR', 'oregon', 'America/Los_Angeles'], ['PA', 'pennsylvania', 'America/New_York'], ['RI', 'rhode island', 'America/New_York'],
  ['SC', 'south carolina', 'America/New_York'], ['SD', 'south dakota', 'America/Chicago'], ['TN', 'tennessee', 'America/Chicago'], ['TX', 'texas', 'America/Chicago'],
  ['UT', 'utah', 'America/Denver'], ['VT', 'vermont', 'America/New_York'], ['VA', 'virginia', 'America/New_York'], ['WA', 'washington', 'America/Los_Angeles'],
  ['WV', 'west virginia', 'America/New_York'], ['WI', 'wisconsin', 'America/Chicago'], ['WY', 'wyoming', 'America/Denver'],
];
const CA_PROVINCES: [string, string, string][] = [
  ['BC', 'british columbia', 'America/Vancouver'], ['AB', 'alberta', 'America/Edmonton'], ['SK', 'saskatchewan', 'America/Regina'], ['MB', 'manitoba', 'America/Winnipeg'],
  ['ON', 'ontario', 'America/Toronto'], ['QC', 'quebec', 'America/Toronto'], ['NB', 'new brunswick', 'America/Halifax'], ['NS', 'nova scotia', 'America/Halifax'],
  ['PE', 'prince edward island', 'America/Halifax'], ['NL', 'newfoundland', 'America/St_Johns'], ['YT', 'yukon', 'America/Whitehorse'], ['NT', 'northwest territories', 'America/Yellowknife'],
  ['NU', 'nunavut', 'America/Iqaluit'],
];
const AU_STATES: [string, string, string][] = [
  ['NSW', 'new south wales', 'Australia/Sydney'], ['VIC', 'victoria', 'Australia/Melbourne'], ['QLD', 'queensland', 'Australia/Brisbane'], ['SA', 'south australia', 'Australia/Adelaide'],
  ['WA', 'western australia', 'Australia/Perth'], ['TAS', 'tasmania', 'Australia/Hobart'], ['ACT', 'australian capital territory', 'Australia/Sydney'], ['NT', 'northern territory', 'Australia/Darwin'],
];

/** Cities in the three split countries, for a zone when no region is named. */
const CITY_ZONES: Record<string, string> = {
  'san francisco': 'America/Los_Angeles', 'los angeles': 'America/Los_Angeles', seattle: 'America/Los_Angeles', 'silicon valley': 'America/Los_Angeles', 'bay area': 'America/Los_Angeles', 'palo alto': 'America/Los_Angeles', 'san jose': 'America/Los_Angeles', 'san diego': 'America/Los_Angeles', portland: 'America/Los_Angeles', 'las vegas': 'America/Los_Angeles',
  denver: 'America/Denver', 'salt lake city': 'America/Denver', phoenix: 'America/Phoenix',
  chicago: 'America/Chicago', austin: 'America/Chicago', dallas: 'America/Chicago', houston: 'America/Chicago', minneapolis: 'America/Chicago', nashville: 'America/Chicago',
  vancouver: 'America/Vancouver', calgary: 'America/Edmonton', edmonton: 'America/Edmonton', winnipeg: 'America/Winnipeg', halifax: 'America/Halifax',
  perth: 'Australia/Perth', adelaide: 'Australia/Adelaide', brisbane: 'Australia/Brisbane', 'gold coast': 'Australia/Brisbane', melbourne: 'Australia/Melbourne', hobart: 'Australia/Hobart', darwin: 'Australia/Darwin',
};

/** The main zone of a country: its capital's, or where most of its people live. */
const ZONES: Record<string, string> = {
  US: 'America/New_York', CA: 'America/Toronto', AU: 'Australia/Sydney', MX: 'America/Mexico_City', BR: 'America/Sao_Paulo', AR: 'America/Argentina/Buenos_Aires',
  CL: 'America/Santiago', CO: 'America/Bogota', PE: 'America/Lima', VE: 'America/Caracas', EC: 'America/Guayaquil', UY: 'America/Montevideo', PY: 'America/Asuncion',
  BO: 'America/La_Paz', CR: 'America/Costa_Rica', PA: 'America/Panama', GT: 'America/Guatemala', DO: 'America/Santo_Domingo', PR: 'America/Puerto_Rico', JM: 'America/Jamaica',
  SV: 'America/El_Salvador', HN: 'America/Tegucigalpa', NI: 'America/Managua', CU: 'America/Havana', TT: 'America/Port_of_Spain', BS: 'America/Nassau', BB: 'America/Barbados',
  GB: 'Europe/London', IE: 'Europe/Dublin', PT: 'Europe/Lisbon', IS: 'Atlantic/Reykjavik', ES: 'Europe/Madrid', FR: 'Europe/Paris', BE: 'Europe/Brussels', NL: 'Europe/Amsterdam',
  LU: 'Europe/Luxembourg', DE: 'Europe/Berlin', DK: 'Europe/Copenhagen', NO: 'Europe/Oslo', SE: 'Europe/Stockholm', FI: 'Europe/Helsinki', CH: 'Europe/Zurich', AT: 'Europe/Vienna',
  IT: 'Europe/Rome', MT: 'Europe/Malta', MC: 'Europe/Monaco', LI: 'Europe/Vaduz', AD: 'Europe/Andorra', SM: 'Europe/San_Marino', VA: 'Europe/Vatican', PL: 'Europe/Warsaw',
  CZ: 'Europe/Prague', SK: 'Europe/Bratislava', HU: 'Europe/Budapest', SI: 'Europe/Ljubljana', HR: 'Europe/Zagreb', BA: 'Europe/Sarajevo', RS: 'Europe/Belgrade', ME: 'Europe/Podgorica',
  MK: 'Europe/Skopje', AL: 'Europe/Tirane', GR: 'Europe/Athens', BG: 'Europe/Sofia', RO: 'Europe/Bucharest', MD: 'Europe/Chisinau', UA: 'Europe/Kyiv', BY: 'Europe/Minsk',
  LT: 'Europe/Vilnius', LV: 'Europe/Riga', EE: 'Europe/Tallinn', CY: 'Asia/Nicosia', TR: 'Europe/Istanbul', RU: 'Europe/Moscow', GE: 'Asia/Tbilisi', AM: 'Asia/Yerevan',
  AZ: 'Asia/Baku', FO: 'Atlantic/Faroe', GL: 'America/Nuuk', GI: 'Europe/Gibraltar', IM: 'Europe/Isle_of_Man', JE: 'Europe/Jersey', GG: 'Europe/Guernsey', AX: 'Europe/Mariehamn',
  IL: 'Asia/Jerusalem', PS: 'Asia/Hebron', JO: 'Asia/Amman', LB: 'Asia/Beirut', SY: 'Asia/Damascus', IQ: 'Asia/Baghdad', IR: 'Asia/Tehran', SA: 'Asia/Riyadh', AE: 'Asia/Dubai',
  QA: 'Asia/Qatar', BH: 'Asia/Bahrain', KW: 'Asia/Kuwait', OM: 'Asia/Muscat', YE: 'Asia/Aden', EG: 'Africa/Cairo', MA: 'Africa/Casablanca', DZ: 'Africa/Algiers', TN: 'Africa/Tunis',
  LY: 'Africa/Tripoli', NG: 'Africa/Lagos', GH: 'Africa/Accra', CI: 'Africa/Abidjan', SN: 'Africa/Dakar', CM: 'Africa/Douala', KE: 'Africa/Nairobi', UG: 'Africa/Kampala',
  TZ: 'Africa/Dar_es_Salaam', RW: 'Africa/Kigali', ET: 'Africa/Addis_Ababa', ZA: 'Africa/Johannesburg', NA: 'Africa/Windhoek', BW: 'Africa/Gaborone', ZW: 'Africa/Harare',
  ZM: 'Africa/Lusaka', MZ: 'Africa/Maputo', AO: 'Africa/Luanda', MU: 'Indian/Mauritius', MG: 'Indian/Antananarivo', SD: 'Africa/Khartoum', CD: 'Africa/Kinshasa',
  IN: 'Asia/Kolkata', PK: 'Asia/Karachi', BD: 'Asia/Dhaka', LK: 'Asia/Colombo', NP: 'Asia/Kathmandu', AF: 'Asia/Kabul', KZ: 'Asia/Almaty', UZ: 'Asia/Tashkent', KG: 'Asia/Bishkek',
  CN: 'Asia/Shanghai', HK: 'Asia/Hong_Kong', MO: 'Asia/Macau', TW: 'Asia/Taipei', JP: 'Asia/Tokyo', KR: 'Asia/Seoul', MN: 'Asia/Ulaanbaatar', SG: 'Asia/Singapore',
  MY: 'Asia/Kuala_Lumpur', TH: 'Asia/Bangkok', VN: 'Asia/Ho_Chi_Minh', PH: 'Asia/Manila', ID: 'Asia/Jakarta', KH: 'Asia/Phnom_Penh', MM: 'Asia/Yangon', LA: 'Asia/Vientiane',
  BN: 'Asia/Brunei', NZ: 'Pacific/Auckland', FJ: 'Pacific/Fiji', PG: 'Pacific/Port_Moresby',
};

/** Lowercase, accents off, curly quotes straight: "København" reads "kobenhavn". */
function fold(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/ø/g, 'o')
    .replace(/Ø/g, 'O')
    .replace(/æ/g, 'ae')
    .replace(/Æ/g, 'AE')
    .replace(/ß/g, 'ss')
    .replace(/[‘’]/g, "'")
    .toLowerCase()
    .trim();
}

let names: Map<string, string> | null = null;

/** Every country name the gate knows (English names from ICU and the aliases), folded. */
function countryNames(): Map<string, string> {
  if (names) return names;
  names = new Map();
  const english = new Intl.DisplayNames(['en'], { type: 'region' });
  for (const code of CODES) {
    const name = english.of(code);
    if (name && name !== code) names.set(fold(name), code);
  }
  // "Georgia" and "Jersey" read as US places far more often in a company location.
  names.delete('georgia');
  names.delete('jersey');
  for (const [alias, code] of Object.entries(COUNTRY_ALIASES)) names.set(fold(alias), code);
  return names;
}

/** Whether `phrase` stands as whole words in `text` (both folded). */
function hasWords(text: string, phrase: string): boolean {
  const i = text.indexOf(phrase);
  if (i < 0) return false;
  const re = new RegExp(`(^|[^\\p{L}\\p{N}])${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}\\p{N}])`, 'u');
  return re.test(text);
}

const sorted = new WeakMap<object, [string, unknown][]>();

/** The first table key found as whole words in `text`, longest keys first. */
function findIn<T>(text: string, table: Map<string, T> | Record<string, T>): T | null {
  let entries = sorted.get(table) as [string, T][] | undefined;
  if (!entries) {
    entries = (table instanceof Map ? [...table.entries()] : Object.entries(table)).sort((a, b) => b[0].length - a[0].length);
    sorted.set(table, entries);
  }
  for (const [key, value] of entries) if (hasWords(text, key)) return value;
  return null;
}

function regionCountry(part: string): string | null {
  const upper = part.trim().toUpperCase();
  const folded = fold(part);
  if (US_STATES.some(([c, n]) => c === upper || n === folded)) return 'US';
  if (CA_PROVINCES.some(([c, n]) => c === upper || n === folded)) return 'CA';
  if (AU_STATES.some(([c, n]) => (c.length === 3 && c === upper) || n === folded)) return 'AU';
  return null;
}

function cctld(domain: string): string | null {
  const label = domain.trim().toLowerCase().replace(/\.$/, '').split('.').pop() ?? '';
  if (label === 'uk') return 'GB';
  if (label.length !== 2 || GENERIC_CCTLDS.has(label)) return null;
  const code = label.toUpperCase();
  return CODES.has(code) ? code : null;
}

/** The country of a location string, or null when it names none the gate knows. */
function locationCountry(location: string, domainCountry: string | null): string | null {
  const parts = location.split(/[,\n;|/]/).map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  const all = fold(location);
  const last = parts[parts.length - 1]!;
  const lastFolded = fold(last).replace(/[0-9]/g, '').trim();
  const countries = countryNames();

  // "..., Denmark", "..., Deutschland", "..., UK"
  const named = countries.get(lastFolded);
  if (named) return named;

  // A short code last: "Austin, TX", "Toronto, ON", "Berlin, DE", "Leeds, GB".
  const code = /^[A-Za-z]{2,3}$/.test(lastFolded) ? lastFolded.toUpperCase() : null;
  if (code) {
    const rest = fold(parts.slice(0, -1).join(', '));
    const city = findIn(rest, CITIES);
    if (city && (city === code || (code === 'UK' && city === 'GB'))) return city;
    if (domainCountry && domainCountry === code) return code;
    const region = parts.length > 1 ? regionCountry(last) : null;
    if (region) return region;
    if (code === 'UK') return 'GB';
    if (CODES.has(code)) return code;
  }

  // A region: "Sydney NSW 2000", "Austin TX 78701", "Ottawa ON K1P 1J1", "Portland, Oregon".
  if (/\b(NSW|VIC|QLD|TAS|ACT)\b/.test(location)) return 'AU';
  if (/\b[A-Z]\d[A-Z] ?\d[A-Z]\d\b/.test(location)) return 'CA';
  const zip = /\b([A-Z]{2}) \d{5}(-\d{4})?\b/.exec(location);
  if (zip && US_STATES.some(([c]) => c === zip[1])) return 'US';
  for (const part of [...parts].reverse()) {
    const full = regionCountry(part.replace(/\d+/g, ''));
    if (full && fold(part).length > 3) return full;
  }

  // A country named anywhere, then a known city.
  const anywhere = findIn(all.replace(/\bnew (mexico|jersey|south wales)\b/g, ' '), countries);
  if (anywhere) return anywhere;
  return findIn(all, CITIES) ?? findIn(all, regionNames());
}

let regions: Map<string, string> | null = null;

/** Full region names of the split countries, folded, to their country. */
function regionNames(): Map<string, string> {
  if (regions) return regions;
  regions = new Map();
  for (const [table, code] of [[US_STATES, 'US'], [CA_PROVINCES, 'CA'], [AU_STATES, 'AU']] as const) {
    for (const [, name] of table) regions.set(name, code);
  }
  return regions;
}

/**
 * Where a recipient sits, as ISO 3166-1 alpha-2: from the company's
 * location when it names a country, region or city the gate knows, else
 * from a country code domain (`.dk`, `.co.uk`). Generic domains (`.com`,
 * `.io`, `.ai`) give null.
 */
export function recipientCountry(o: { location: string | null; domain: string }): string | null {
  const fromDomain = cctld(o.domain);
  const fromLocation = o.location ? locationCountry(o.location, fromDomain) : null;
  return fromLocation ?? fromDomain;
}

/** Whether nvoke never writes to a recipient in this country (BLOCKED_COUNTRIES). */
export function isBlockedCountry(country: string | null): boolean {
  if (!country) return false;
  return (BLOCKED_COUNTRIES as readonly string[]).includes(country.toUpperCase());
}

/**
 * The IANA zone a recipient's working hours are read in: the country's main
 * zone, refined by a state, province or city in the location for the United
 * States, Canada and Australia. 'UTC' when the country is unknown.
 */
export function timezoneFor(country: string | null, location?: string | null): string {
  if (!country) return 'UTC';
  const code = country.toUpperCase();
  const regions = code === 'US' ? US_STATES : code === 'CA' ? CA_PROVINCES : code === 'AU' ? AU_STATES : null;
  if (regions && location) {
    const parts = location.split(/[,\n;|/]/).map((p) => p.trim()).filter(Boolean).reverse();
    // A region code standing as its own word ("Austin, TX 78701", "Sydney NSW 2000").
    for (const part of parts) {
      for (const word of part.split(/\s+/)) {
        const hit = /^[A-Z]{2,3}$/.test(word) ? regions.find(([c]) => c === word) : undefined;
        if (hit) return hit[2];
      }
    }
    const folded = fold(location);
    const city = findIn(folded, CITY_ZONES);
    if (city) return city;
    const byName = [...regions].sort((a, b) => b[1].length - a[1].length).find(([, n]) => hasWords(folded, n));
    if (byName) return byName[2];
  }
  return ZONES[code] ?? 'UTC';
}
