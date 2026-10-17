// The people a company names on its own pages: the team page, the about
// page, the imprint, a founder's byline. Pure and IO free, like extract.ts,
// and shared by the server crawl and the desktop's local render crawl.
//
// Heuristics, biased towards precision: a name is kept only with something
// that says it is a person of the company (a title next to it, an imprint
// label, schema.org markup, or an address on the page made from it).
// Testimonials, quotes and client logos are left out before reading.

import { load, type CheerioAPI } from 'cheerio';
import type { Seniority } from '../leads.ts';
import { foldTitle, hasTitleWord, looksLikeTitle, seniorityOf } from './seniority.ts';

export interface FoundPerson {
  firstName: string;
  /** Everything after the first name: "van der Berg", "Maria Schmidt". */
  lastName: string;
  /** As printed, or null when the page gave none. */
  title: string | null;
  seniority: Seniority | null;
  sourceUrl: string | null;
}

/** People kept per company at most. */
export const PEOPLE_MAX = 15;
/** People read from one page at most: more is a directory or a client list. */
const PAGE_PEOPLE_MAX = 40;

// Names

/** Honorifics and academic titles in front of a name, left out. */
const HONORIFIC = /^(dr|prof|mr|mrs|ms|miss|mag|dipl|drs|mme|mlle|herr|frau|sir)\.?$|^(hr|fr|ing|lic|cand|univ|med|dent|jur|phil|rer|nat|pd|m)\.$|^dipl\.?-[a-z]+\.?$/i;
/** Degrees and suffixes after a name, left out. Case matters: "Jack Ma" keeps his name. */
const SUFFIX = /^(MBA|PhD|Ph\.D\.?|MSc|M\.Sc\.?|BSc|B\.Sc\.?|MA|BA|LLM|LL\.M\.?|CPA|CFA|Jr|Sr|II|III|IV|DDS|DMD|BDS|MD)\.?,?$/;
/** Lowercase name particles: "Jan van der Berg", "Ludwig von Mises", "Ana de la Cruz". */
const PARTICLES = new Set(['van', 'von', 'der', 'den', 'de', 'da', 'di', 'du', 'la', 'le', 'del', 'della', 'dos', 'das', 'af', 'zu', 'ten', 'ter', 'op', 'vom', 'y', 'e', 'bin', 'al', "van't", 'zur']);
/** One capitalized name, hyphenated parts allowed: "Anne-Marie", "O'Brien", "McDonald", "Søren". */
const NAME_TOKEN = /^(?:(?:Mc|Mac|O['’]|D['’])?\p{Lu}\p{Ll}+(?:['’]\p{Ll}+)?)(?:-(?:\p{Lu}\p{Ll}+))*$/u;
const INITIAL = /^\p{Lu}\.$/u;

/**
 * Words that are never part of a person's name: what a company does or a
 * site says, legal forms, places, months and days. Folded (foldTitle).
 */
const NOT_NAME = new Set(
  `our the and team teams meet about contact us home blog news read more learn get started free book call demo case cases
  work works project projects client clients customer customers partners career careers job jobs privacy policy terms cookie
  cookies settings service services solution solutions product products pricing price prices feature features company companies
  management board leadership founders office offices location locations address phone email mail web website online digital
  agency studio group development strategy brand branding content social media growth performance seo sem ppc data analytics
  consulting software technology tech cloud platform app apps mobile business executive senior junior international global
  nordic nordics europe european new best top award awards insights resources events event story stories mission vision values
  culture history join hiring open positions apply follow linkedin twitter instagram facebook youtube github tiktok copyright
  rights reserved welcome hello thank thanks you your view profile see show discover explore shop store cart login sign menu
  search english dansk deutsch svenska norsk nederlands francais espanol ecommerce commerce marketing sales support success
  people staff employees employee center centre house lab labs works factory design solutions systems network networks
  ventures capital partners holding holdings invest investments health care clinic klinik dental law legal advisory finance
  financial bank insurance real estate property media creative interactive communications consultancy academy school university
  institute foundation association club hotel restaurant cafe bar kitchen coffee press release case study white paper ebook
  webinar podcast video gallery portfolio testimonials reviews faq help docs documentation api integrations download trial
  manager director founder partner owner chief officer head lead
  om os vores kontakt ydelser kunder priser nyheder ledelse ledelsen medarbejdere ansatte bestyrelse bestyrelsen
  uber ueber uns unser unsere leistungen kunden karriere impressum datenschutz wir geschaftsfuhrung vorstand
  ons onze over diensten klanten nous notre equipe qui sommes sobre nosotros equipo oss vart tjanster tjenester
  aps as gmbh ltd limited inc llc ab bv nv sa sas sarl oy oyj plc ag kg co ug ivs se srl spa sl llp pty corp
  january february march september october november december januar februar marts oktober dezember maerz
  monday tuesday wednesday thursday friday saturday sunday mandag tirsdag onsdag torsdag fredag lordag sondag
  montag dienstag mittwoch donnerstag freitag samstag sonntag
  denmark danmark germany deutschland sweden sverige norway norge netherlands nederland france spain espana
  austria osterreich switzerland schweiz finland suomi belgium belgie belgique poland polska italy italia portugal
  ireland scotland england wales britain uk usa america canada australia
  copenhagen kobenhavn aarhus odense aalborg esbjerg randers kolding horsens vejle roskilde herning silkeborg
  berlin hamburg munchen munich koln cologne frankfurt stuttgart dusseldorf dortmund essen leipzig bremen dresden hannover nurnberg
  amsterdam rotterdam utrecht eindhoven groningen haag stockholm goteborg gothenburg malmo uppsala oslo bergen trondheim
  stavanger helsinki tampere espoo london manchester birmingham leeds glasgow edinburgh bristol liverpool dublin paris lyon
  marseille toulouse lille nantes madrid barcelona valencia sevilla bilbao vienna wien zurich geneva genf basel bern
  brussels bruxelles antwerp antwerpen warsaw warszawa krakow lisbon lisboa porto milan milano rome roma york francisco angeles`
    .split(/\s+/)
    .filter(Boolean),
);

/** Title case for a name printed in capitals: "JANE DOE" reads "Jane Doe". */
function titleCase(token: string): string {
  return token
    .toLowerCase()
    .replace(/(^|[-'’])(\p{Ll})/gu, (_m, sep: string, c: string) => sep + c.toUpperCase());
}

/**
 * A person's name, or null when the text is not one: 2 to 4 capitalized
 * words (lowercase particles between), none of them a word a company or a
 * page uses. Honorifics, middle initials and degrees are left out; the first
 * word is the first name and the rest the last name.
 */
export function parseName(raw: string): { firstName: string; lastName: string } | null {
  const text = raw.replace(/[\u00a0\s]+/g, ' ').trim().replace(/[,;:.]+$/, '');
  if (text.length < 4 || text.length > 60 || /[\d@/\\|()[\]{}<>"!?#*=+&]/.test(text)) return null;
  let tokens = text.split(' ');
  // A name printed in capitals.
  if (!/\p{Ll}/u.test(text) && /\p{Lu}/u.test(text)) tokens = tokens.map((t) => (INITIAL.test(t) ? t : titleCase(t)));
  while (tokens.length > 0 && HONORIFIC.test(tokens[0]!)) tokens.shift();
  while (tokens.length > 0 && SUFFIX.test(tokens[tokens.length - 1]!)) tokens.pop();
  tokens = tokens.map((t) => t.replace(/,$/, ''));
  tokens = tokens.filter((t, i) => !(INITIAL.test(t) && i > 0 && i < tokens.length - 1));
  if (tokens.length < 2 || tokens.length > 5) return null;
  const first = tokens[0]!;
  const last = tokens[tokens.length - 1]!;
  if (!NAME_TOKEN.test(first) || !NAME_TOKEN.test(last)) return null;
  let words = 0;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    const folded = foldTitle(t);
    if (i > 0 && i < tokens.length - 1 && PARTICLES.has(t)) continue;
    if (!NAME_TOKEN.test(t)) return null;
    if (NOT_NAME.has(folded) || hasTitleWord(folded)) return null;
    words++;
  }
  if (words < 2 || words > 4) return null;
  return { firstName: first, lastName: tokens.slice(1).join(' ') };
}

// Titles

/** Text around a title that is not part of it. */
function cleanTitle(raw: string): string {
  return raw
    .slice(0, 300)
    .replace(/[\u00a0\s]+/g, ' ')
    .replace(/^[\s,:;|·•/()\u2013\u2014-]+|[\s,:;|·•/()\u2013\u2014-]+$/g, '')
    .slice(0, 120)
    .trim();
}

/** A title of somebody at another company: "CEO at Acme", "Partner hos Bureau". Testimonials read like this. */
const ELSEWHERE = /\s(at|hos|bei|chez|bij|en|på|pa|i|@)\s+\p{Lu}/u;
/** Legal forms: a title that names one is about a company. */
const LEGAL_FORM = /\b(inc|ltd|llc|llp|plc|gmbh|ag|aps|a\/s|as|ab|asa|bv|nv|oy|sarl|sas|srl|spa|corp|co|limited|company)\b\.?/i;
/** Seniorities that are "of" a company rather than of a department: "Founder of Bakery Inc", "CEO of Acme". */
const OF_COMPANY = /\b(founder|co-?founder|owner|ceo|president|chairman|grundlaegger|stifter|ejer|indehaver|inhaber|grunder|oprichter|eigenaar|fondateur)\b.*\b(of|von|af|de|for)\s+\p{Lu}/iu;

/**
 * The company the page belongs to, as the words its domain is made of, so
 * "CEO, Acme" on acme.dk is the company's own CEO and not a testimonial.
 */
export interface OwnCompany {
  /** Brand label of the domain, lowercase: "acme" for www.acme.dk. */
  label: string | null;
}

export function ownCompanyOf(sourceUrl: string | null): OwnCompany {
  if (!sourceUrl) return { label: null };
  try {
    const parts = new URL(sourceUrl).hostname.toLowerCase().replace(/^www\./, '').split('.');
    const label = parts.length >= 3 && parts[parts.length - 2]!.length <= 3 ? parts[parts.length - 3]! : parts[parts.length - 2] ?? parts[0]!;
    return { label: label.replace(/-/g, '') };
  } catch {
    return { label: null };
  }
}

/** Whether a company name in a title is the page's own company. */
function isOwn(org: string, own: OwnCompany): boolean {
  if (!own.label) return false;
  const words = foldTitle(org)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !LEGAL_FORM.test(w));
  if (words.length === 0) return false;
  return words.join('') === own.label || words.some((w) => own.label!.includes(w) || w.includes(own.label!));
}

/** A part after the comma in a title that is not a company: a place, an office code ("CPH"), another role. */
function isPlaceOrRole(part: string): boolean {
  const words = foldTitle(part).split(/[^a-z]+/).filter(Boolean);
  if (words.length > 0 && words.every((w) => NOT_NAME.has(w))) return true;
  if (/^\p{Lu}{2,4}$/u.test(part.trim())) return true;
  return hasTitleWord(part) && !LEGAL_FORM.test(part);
}

/**
 * Whether a title is held at another company: "CEO at Clientco",
 * "CEO, Acme Corp", "Founder of Bakery Inc". A company named in it that is
 * the page's own does not count.
 */
export function titleElsewhere(title: string, own: OwnCompany = { label: null }): boolean {
  const t = ` ${title}`;
  const at = ELSEWHERE.exec(t);
  if (at && !isOwn(t.slice(at.index + at[0].length - 1), own)) return true;
  const of = OF_COMPANY.exec(title);
  if (of) {
    const org = title.slice(title.search(/\b(of|von|af|de|for)\s+\p{Lu}/u)).replace(/^\S+\s+/, '');
    if (!isOwn(org, own)) return true;
  }
  const comma = title.indexOf(',');
  if (comma > 0) {
    const rest = title.slice(comma + 1).trim();
    if (rest && !isPlaceOrRole(rest) && !isOwn(rest, own)) return true;
  }
  if (LEGAL_FORM.test(title) && !isOwn(title, own)) return true;
  return false;
}

/** Credits in an imprint or a footer: the agency that built the site, the photographer. Never the company's people. */
const CREDIT = /^(design|webdesign|web design|website|webseite|webside|programmierung|programming|development|udvikling|entwicklung|realisierung|realisation|umsetzung|konzept|concept|layout|grafik|gestaltung|foto|fotos|photo|photos|photography|fotografie|fotografi|bilder|billeder|images|bildnachweis|illustration|illustrationer|text|texte|tekst|copy|hosting|credits|seo|produktion|production)( (and|und|og|&) \w+)?$/;

function isCredit(label: string): boolean {
  return CREDIT.test(foldTitle(label.replace(/[:\s]+$/, '')));
}

/** A degree after a comma: "Jane Doe, MD" is a doctor, not a managing director. */
const DEGREE = /^(m\.?d\.?|ph\.?d\.?|dds|dmd|bds|mba|msc|cpa)$/i;
const DEGREE_TAIL = /,\s*(m\.?d\.?|ph\.?d\.?|dds|dmd|bds)\s*$/i;

/** The title in a piece of text, or null: title-like, not held elsewhere, not a credit or a group heading. */
function titleOf(raw: string, own: OwnCompany): string | null {
  if (isCredit(raw)) return null;
  const title = cleanTitle(raw);
  if (!looksLikeTitle(title) || titleElsewhere(title, own)) return null;
  if (GROUP_HEADING.test(foldTitle(title))) return null;
  return title;
}

/**
 * A job title as printed, checked like the crawl's own: null when it does
 * not read as a title, `elsewhere` when it is held at another company.
 */
export function checkTitle(raw: string, own: OwnCompany = { label: null }): { title: string | null; elsewhere: boolean } {
  const title = cleanTitle(raw);
  if (title && titleElsewhere(title, own)) return { title: null, elsewhere: true };
  return { title: titleOf(raw, own), elsewhere: false };
}

/** A heading over a group of people ("Our team", "Ledelse", "Board of Directors"): not anyone's title. */
const GROUP_HEADING = /\b(team|teams|directors|partners|founders|managers|owners|people|staff|employees|ledelse|ledelsen|management|leadership|board|bestyrelse|bestyrelsen|vorstand|geschaftsfuhrung|medarbejdere|ansatte|mitarbeiter|mitarbeitende|meet|kontakt|contact)\b/;

// Lines

/** Labels in an imprint that name the company's representatives without a title. */
const REPRESENTED_BY = /^(vertreten durch|vertretungsberechtigte?r?( geschaftsfuhrer)?|represented by|legal representative|repraesentant|wettelijk vertegenwoordiger)$/;

/** Short lines between a name and its title that say nothing: icons, links, a phone number. */
const FILLER = /^(linkedin|twitter|x|e-?mail|mail|phone|tel\.?|telefon|call|ring|instagram|facebook|github|read more|laes mere|mehr|meer|plus|bio|profile|profil|\+?[\d\s()./-]{6,}|[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+)$/iu;

const NAME_SEPARATORS = /\s*,\s*|\s*;\s*|\s*&\s*|\s+(?:und|and|og|och|en|et|y|sowie)\s+/;

interface Candidate {
  name: { firstName: string; lastName: string };
  title: string | null;
  seniority?: Seniority | null;
}

/** "Geschäftsführer: Max Mustermann, Erika Musterfrau", "Inhaber: X", "CEO: Jane Doe". */
function labelled(line: string, own: OwnCompany): Candidate[] {
  const m = /^(.{2,60}?)\s*[:：]\s*(.{4,200})$/u.exec(line);
  if (!m) return [];
  if (isCredit(m[1]!)) return [];
  const label = cleanTitle(m[1]!);
  const represented = REPRESENTED_BY.test(foldTitle(label));
  if (!represented && (!looksLikeTitle(label) || titleElsewhere(label, own))) return [];
  const out: Candidate[] = [];
  for (const part of m[2]!.split(NAME_SEPARATORS)) {
    const name = parseName(part);
    if (!name) break;
    out.push(represented ? { name, title: null, seniority: 'founder' } : { name, title: label });
  }
  return out;
}

const SEPARATOR = /\s*[,|·•/:]\s*|\s+[-\u2013\u2014]\s+|\s*\(\s*/;

/** "Jane Doe, CEO", "Jane Doe - Founder", "Jane Doe (Partner)", and the other way round. */
function separated(line: string, own: OwnCompany): Candidate | null {
  const m = SEPARATOR.exec(line);
  if (!m || m.index === 0) return null;
  const before = line.slice(0, m.index);
  const after = line.slice(m.index + m[0].length).replace(/\)\s*$/, '');
  if (m[0].includes(':') && isCredit(before)) return null;
  const name = parseName(before);
  if (name && m[0].includes(',') && DEGREE.test(after.trim())) return null;
  const title = name ? titleOf(after, own) : null;
  if (name && title) return { name, title };
  const reversedName = parseName(after);
  const reversedTitle = reversedName ? titleOf(before, own) : null;
  if (reversedName && reversedTitle) return { name: reversedName, title: reversedTitle };
  return null;
}

/** "Jane Doe CEO" and "CEO & Founder Jane Doe", a name and a title run together. */
function runTogether(line: string, own: OwnCompany): Candidate | null {
  const tokens = line.split(' ');
  for (let k = Math.min(5, tokens.length - 1); k >= 2; k--) {
    const name = parseName(tokens.slice(0, k).join(' '));
    const title = name ? titleOf(tokens.slice(k).join(' '), own) : null;
    if (name && title) return { name, title };
  }
  for (let k = Math.min(5, tokens.length - 1); k >= 2; k--) {
    const name = parseName(tokens.slice(-k).join(' '));
    const title = name ? titleOf(tokens.slice(0, -k).join(' '), own) : null;
    if (name && title) return { name, title };
  }
  return null;
}

/** The people one line names with their titles. */
function fromLine(raw: string, own: OwnCompany): Candidate[] {
  if (raw.length > 200) return [];
  // "Jane Doe, MD" is a doctor: the degree is no title.
  const line = raw.replace(DEGREE_TAIL, '');
  const label = labelled(line, own);
  if (label.length > 0) return label;
  const one = separated(line, own) ?? runTogether(line, own);
  if (one) return [one];
  // A footer line of parts: "Acme ApS · CVR 12345678 · Adm. direktør Jens Hansen".
  const parts = line.split(/\s+[·•|]\s+/);
  if (parts.length < 2) return [];
  return parts.flatMap((p) => {
    const l = labelled(p, own);
    if (l.length > 0) return l;
    const c = separated(p, own) ?? runTogether(p, own);
    return c ? [c] : [];
  });
}

/** What is never a page's own people: quotes, reviews, sliders of them, client and customer sections. */
const NOT_OWN = [
  'blockquote',
  'q',
  'nav',
  'form',
  '[class*="testimonial" i]',
  '[id*="testimonial" i]',
  '[class*="review" i]',
  '[id*="review" i]',
  '[class*="quote" i]',
  '[class*="client" i]',
  '[class*="customer" i]',
  '[class*="kunde" i]',
  '[class*="reference" i]',
  '[class*="referenz" i]',
  '[class*="logo" i]',
  '[class*="comment" i]',
  '[class*="credit" i]',
  '[itemtype*="schema.org/Review" i]',
].join(', ');

/** Sliders: team pages use them too, so one goes only when it holds quotes or star ratings. */
const SLIDERS = '[class*="swiper" i], [class*="slick" i], [class*="carousel" i], [class*="slider" i]';
const QUOTED = /[“”„«»★]|(^|\s)"\p{L}/u;

function removeNotOwn($: CheerioAPI): void {
  $(NOT_OWN).remove();
  $(SLIDERS).each((_i, el) => {
    if (QUOTED.test($(el).text())) $(el).remove();
  });
}

/**
 * The HTML of a page without its quotes, testimonials, reviews and client
 * sections, for reading people (and for the text the people step sends Claude).
 */
export function withoutQuotes(html: string): string {
  try {
    const $ = load(html);
    removeNotOwn($);
    return $.html();
  } catch {
    return html;
  }
}

const BLOCKS =
  'p, br, div, li, ul, ol, tr, td, th, dd, dt, dl, h1, h2, h3, h4, h5, h6, section, article, header, footer, aside, figure, figcaption, address, main, table, hr';
/** Inline elements that usually hold one field of a card: the name, the title, the role. */
const FIELDS = '[class*="name" i], [class*="title" i], [class*="position" i], [class*="role" i], [class*="job" i], [class*="stilling" i], [class*="funktion" i]';

/** The page's visible text as lines, one per block, with addresses from mailto links written in. NOT_OWN must be gone. */
function linesOf($: CheerioAPI): string[] {
  $('script, style, noscript, svg, template, iframe').remove();
  $('a[href^="mailto:" i]').each((_i, el) => {
    const address = ($(el).attr('href') ?? '').slice(7, 300).split('?')[0]?.trim() ?? '';
    if (address.includes('@')) $(el).after(`\n${address}\n`);
  });
  $(BLOCKS).before('\n').after('\n');
  $(FIELDS).before('\n').after('\n');
  $('span, a, strong, b, em, i, small, label').after(' ');
  return ($('body').text() || $.root().text())
    .split('\n')
    .map((l) => l.replace(/[\u00a0\s]+/g, ' ').trim())
    .filter(Boolean);
}

/** A quote, or the end of one: the words before a testimonial's author. */
const QUOTE_LINE = /^["“”„«»‘’]|["“”„«»]\s*$/;

/** Lines that follow a quote: the author of a testimonial and their title. */
function afterQuotes(lines: string[]): Set<number> {
  const out = new Set<number>();
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!QUOTE_LINE.test(line) && !(line.length > 80 && /[.!]["“”»]?$/.test(line) && /["“”„«»]/.test(line))) continue;
    for (let j = i + 1; j <= Math.min(lines.length - 1, i + 3); j++) out.add(j);
  }
  return out;
}

// Structured data

interface JsonLdPerson {
  name: string;
  title: string | null;
  /** Listed as the organization's founder. */
  founder?: boolean;
}

function textValue(v: unknown): string | null {
  if (typeof v === 'string') return v.slice(0, 200);
  if (Array.isArray(v)) return v.slice(0, 5).map(textValue).filter(Boolean).join(', ') || null;
  if (v && typeof v === 'object' && 'name' in v) return textValue((v as { name: unknown }).name);
  return null;
}

/** Keys of an organization that lead to its own people. */
const OWN_PEOPLE_KEYS = new Set(['founder', 'founders', 'employee', 'employees', 'member', 'members', 'contactPoint', 'ceo', 'director']);

/** schema.org Person nodes with a job title, or listed as a founder or employee. */
function jsonLdPeople(raw: string): JsonLdPerson[] {
  const out: JsonLdPerson[] = [];
  const visit = (node: unknown, via: string | null, depth: number): void => {
    if (depth > 8 || !node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const n of node) visit(n, via, depth + 1);
      return;
    }
    const obj = node as Record<string, unknown>;
    const types = ([] as unknown[]).concat(obj['@type'] ?? []).map(String);
    if (types.includes('Review')) return;
    if (types.includes('Person')) {
      const name = textValue(obj.name) ?? [textValue(obj.givenName), textValue(obj.familyName)].filter(Boolean).join(' ');
      const title = textValue(obj.jobTitle) ?? textValue(obj.hasOccupation);
      if (name && (title || via)) out.push({ name, title, ...(via === 'founder' || via === 'founders' ? { founder: true } : {}) });
    }
    for (const [key, value] of Object.entries(obj)) {
      if (key === 'review' || key === 'author' || key === 'creator' || key === 'publisher' || key === 'mentions') continue;
      visit(value, OWN_PEOPLE_KEYS.has(key) ? key : null, depth + 1);
    }
  };
  try {
    visit(JSON.parse(raw), null, 0);
  } catch {
    // Invalid JSON-LD is common and holds nothing we can trust.
  }
  return out;
}

/** JSON-LD and microdata people. Run after NOT_OWN is removed, so a review's author is never one. */
function structured($: CheerioAPI): JsonLdPerson[] {
  const out: JsonLdPerson[] = [];
  $('script[type="application/ld+json"]').each((_i, el) => {
    out.push(...jsonLdPeople($(el).text()));
  });
  $('[itemtype*="schema.org/Person" i]').each((_i, el) => {
    const scope = $(el);
    if (scope.closest('[itemtype*="schema.org/Review" i]').length > 0) return;
    const value = (prop: string) => {
      const v = scope.find(`[itemprop="${prop}"]`).first();
      return (v.attr('content') ?? v.text()).slice(0, 200).replace(/\s+/g, ' ').trim();
    };
    const name = value('name') || [value('givenName'), value('familyName')].filter(Boolean).join(' ');
    const title = value('jobTitle');
    if (name && title) out.push({ name, title });
  });
  return out;
}

// Pages

/**
 * The people a page names, each with the title next to their name when
 * there is one. Reads schema.org markup, team cards (a name with a title on
 * the line before or after it, whichever way the page's cards run), imprint
 * labels ("Geschäftsführer: Max Mustermann", "Adm. direktør Jens Hansen"),
 * and names whose address is on the page. Quotes, testimonials, reviews,
 * client sections, credits and titles held at other companies are skipped.
 */
export function extractPeople(html: string, sourceUrl: string | null = null): FoundPerson[] {
  if (!html) return [];
  let $: CheerioAPI;
  try {
    $ = load(html);
  } catch {
    return [];
  }
  const own = ownCompanyOf(sourceUrl);
  removeNotOwn($);
  const found: Candidate[] = [];
  for (const p of structured($)) {
    const name = parseName(p.name);
    if (!name) continue;
    const checked = p.title ? checkTitle(p.title, own) : { title: null, elsewhere: false };
    if (checked.elsewhere) continue;
    const title = p.title ? cleanTitle(p.title) || null : null;
    found.push({ name, title, ...(p.founder && !title ? { seniority: 'founder' as const } : {}) });
  }

  const lines = linesOf($);
  const used = afterQuotes(lines);
  for (let i = 0; i < lines.length; i++) {
    if (used.has(i)) continue;
    const people = fromLine(lines[i]!, own);
    if (people.length > 0) {
      used.add(i);
      found.push(...people);
    }
  }

  // Team cards: a line that is only a name, and a title on the next line or the one before.
  const nameAt = new Map<number, { firstName: string; lastName: string }>();
  for (let i = 0; i < lines.length; i++) {
    if (used.has(i)) continue;
    const name = parseName(lines[i]!);
    if (name) nameAt.set(i, name);
  }
  const step = (i: number, dir: 1 | -1): number => {
    let j = i + dir;
    for (let skipped = 0; j >= 0 && j < lines.length && skipped < 2 && FILLER.test(lines[j]!); skipped++) j += dir;
    return j;
  };
  const titleAt = (j: number): string | null => {
    if (j < 0 || j >= lines.length || used.has(j) || nameAt.has(j)) return null;
    return titleOf(lines[j]!, own);
  };
  // Which way the page's cards run: the side that gives more names a title.
  // "CEO / Jane Doe / CTO / John Smith" read name first would hand Jane John's title.
  const below = [...nameAt.keys()].filter((i) => titleAt(step(i, 1))).length;
  const above = [...nameAt.keys()].filter((i) => titleAt(step(i, -1))).length;
  const sides: Array<1 | -1> = above > below ? [-1, 1] : [1, -1];
  for (const dir of sides) {
    for (const [i, name] of nameAt) {
      const j = step(i, dir);
      const title = titleAt(j);
      if (!title) continue;
      found.push({ name, title });
      used.add(i).add(j);
      nameAt.delete(i);
    }
  }
  // A name without a title, but with an address made from it close by: "Mette Hansen / mette@acme.dk".
  for (const [i, name] of nameAt) {
    for (let j = Math.max(0, i - 3); j <= Math.min(lines.length - 1, i + 3); j++) {
      const address = /[\p{L}\p{N}._%+-]{1,64}@[\p{L}\p{N}.-]{1,200}\.[a-z]{2,}/iu.exec(lines[j]!.slice(0, 300))?.[0];
      if (address && strongMatch(address, name)) {
        found.push({ name, title: null });
        break;
      }
    }
  }

  return mergePeople(
    found.slice(0, PAGE_PEOPLE_MAX).map((c) => ({
      firstName: c.name.firstName,
      lastName: c.name.lastName,
      title: c.title,
      seniority: c.seniority !== undefined ? c.seniority : seniorityOf(c.title),
      sourceUrl,
    })),
    PAGE_PEOPLE_MAX,
  );
}

const RANK: Record<Seniority, number> = { founder: 0, executive: 1, director: 2, manager: 3, staff: 4 };
const rankOf = (p: FoundPerson) => (p.seniority ? RANK[p.seniority] : 5);

/** The key two mentions of one person share. */
export function personKey(p: { firstName: string; lastName: string }): string {
  return `${p.firstName.toLowerCase()} ${p.lastName.toLowerCase()}`;
}

/**
 * One entry per person, keeping the most senior title any page gave them,
 * decision makers first, then the rest in the order found, at most `max`.
 */
export function mergePeople(people: FoundPerson[], max = PEOPLE_MAX): FoundPerson[] {
  const byKey = new Map<string, FoundPerson>();
  for (const p of people) {
    const key = personKey(p);
    const had = byKey.get(key);
    if (!had) byKey.set(key, p);
    else if ((!had.title && p.title) || (p.title && rankOf(p) < rankOf(had))) byKey.set(key, { ...p, sourceUrl: p.sourceUrl ?? had.sourceUrl });
  }
  return [...byKey.values()]
    .map((p, i) => ({ p, i }))
    .sort((a, b) => rankOf(a.p) - rankOf(b.p) || a.i - b.i)
    .slice(0, max)
    .map(({ p }) => p);
}

// Addresses

/** How a name is spelled in an address: lowercase ASCII, with the German and Nordic letters both ways. */
function spellingsOf(word: string): string[] {
  const lower = word.toLowerCase().replace(/['’\s]/g, '');
  const spelled = lower.replace(/æ/g, 'ae').replace(/ø/g, 'oe').replace(/å/g, 'aa').replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');
  const plain = lower.replace(/æ/g, 'ae').replace(/ø/g, 'o').replace(/å/g, 'a').replace(/ß/g, 'ss');
  const strip = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z-]/g, '');
  const out = new Set<string>();
  for (const s of [spelled, plain].map(strip)) {
    if (!s) continue;
    out.add(s.replace(/-/g, ''));
    if (s.includes('-')) out.add(s.split('-')[0]!);
  }
  return [...out];
}

/** The local parts an address of this person may have, the ones that name both first and last name. */
function strongLocals(p: { firstName: string; lastName: string }): Set<string> {
  const firsts = spellingsOf(p.firstName);
  const lastParts = p.lastName.split(' ').filter((t) => !PARTICLES.has(t));
  const lasts = [...new Set([...spellingsOf(p.lastName.replace(/\s+/g, '')), ...spellingsOf(lastParts[lastParts.length - 1] ?? '')])];
  const out = new Set<string>();
  for (const f of firsts) {
    for (const l of lasts) {
      if (!f || !l) continue;
      for (const sep of ['.', '_', '-', '']) {
        out.add(`${f}${sep}${l}`);
        out.add(`${l}${sep}${f}`);
        out.add(`${f[0]}${sep}${l}`);
        out.add(`${f}${sep}${l[0]}`);
        out.add(`${l}${sep}${f[0]}`);
      }
    }
  }
  return out;
}

/** The local parts that name only one of them, or the initials: right only when no one else on the page fits. */
function weakLocals(p: { firstName: string; lastName: string }): Set<string> {
  const out = new Set<string>([...spellingsOf(p.firstName), ...spellingsOf(p.lastName.split(' ').pop() ?? '')]);
  const initials = [p.firstName, ...p.lastName.split(' ').filter((t) => !PARTICLES.has(t))]
    .map((t) => spellingsOf(t)[0]?.[0] ?? '')
    .join('');
  if (initials.length >= 2) out.add(initials);
  for (const v of [...out]) if (v.length < 2) out.delete(v);
  return out;
}

function localOf(address: string): string {
  return (address.slice(0, address.lastIndexOf('@')).split('+')[0] ?? '').toLowerCase();
}

function strongMatch(address: string, p: { firstName: string; lastName: string }): boolean {
  return strongLocals(p).has(localOf(address));
}

/**
 * The person an address belongs to, judged from its local part: first.last,
 * flast, first and the rest. A local part that names first and last name
 * wins; one that names only a first name, a last name or the initials
 * counts only when exactly one of the people fits. Null when none or more
 * than one do.
 */
export function personForAddress<T extends { firstName: string; lastName: string }>(address: string, people: T[]): T | null {
  const local = localOf(address);
  if (!local) return null;
  const strong = people.filter((p) => strongLocals(p).has(local));
  if (strong.length === 1) return strong[0]!;
  if (strong.length > 1) return null;
  const weak = people.filter((p) => weakLocals(p).has(local));
  return weak.length === 1 ? weak[0]! : null;
}
