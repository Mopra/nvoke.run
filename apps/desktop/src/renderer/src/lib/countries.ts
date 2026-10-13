/**
 * Every country and territory in ISO 3166-1 alpha-2, named in English by the
 * runtime (Chromium ships full ICU), sorted by name.
 */
const CODES =
  'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW';

export interface Country {
  code: string;
  name: string;
}

let cache: Country[] | null = null;

export function countries(): Country[] {
  if (cache) return cache;
  const names = new Intl.DisplayNames(['en'], { type: 'region' });
  cache = CODES.split(' ')
    .map((code) => ({ code, name: names.of(code) ?? code }))
    .sort((a, b) => a.name.localeCompare(b.name, 'en'));
  return cache;
}

export function countryName(code: string): string | undefined {
  return countries().find((c) => c.code === code.toUpperCase())?.name;
}

/**
 * Countries matching a query: names that start with it first, then names with
 * a word starting with it, then the exact code (so "gb" or "us" find theirs).
 */
export function matchCountries(query: string): Country[] {
  const q = query.trim().toLowerCase();
  if (!q) return countries();
  const starts: Country[] = [];
  const words: Country[] = [];
  for (const c of countries()) {
    const name = c.name.toLowerCase();
    if (name.startsWith(q)) starts.push(c);
    else if (name.split(/[\s(),.-]+/).some((w) => w.startsWith(q)) || c.code.toLowerCase() === q) words.push(c);
  }
  return [...starts, ...words];
}
