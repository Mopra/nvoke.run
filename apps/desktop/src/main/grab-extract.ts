import { itemDomain } from '@nvoke/shared';
import type { GrabItem } from '../ipc/contract';

/**
 * Turns the text OCR read off a screen region into the companies on it: the
 * domains (from domains, URLs and email addresses) and the lines that read
 * as company names. Pure, so it tests without Electron or an OCR engine.
 *
 * People are left out on purpose. An email address stands only for its
 * domain, and a line that reads as a person's name or a job title is dropped
 * (a title line keeps the company after "at"). Only the count of dropped
 * people leaves this function.
 */

export interface Extracted {
  items: GrabItem[];
  /** Lines that read as a person's name, a title or a personal address, left out. */
  people: number;
}

const MAX_ITEMS = 1000;

/** Hosts of personal mailboxes: the address names a person, not a company. */
const FREE_MAIL = new Set([
  'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com', 'msn.com', 'yahoo.com', 'icloud.com', 'me.com',
  'mac.com', 'aol.com', 'proton.me', 'protonmail.com', 'gmx.de', 'gmx.net', 'web.de', 'mail.com', 'yandex.ru', 'hotmail.dk',
  'live.dk', 'outlook.dk', 'jubii.dk', 'sol.dk', 'mail.dk', 'qq.com', '163.com',
]);

/** File names and code that look like hosts to the loose domain check. */
const NOT_TLD = new Set(['js', 'ts', 'py', 'md', 'txt', 'pdf', 'png', 'jpg', 'jpeg', 'gif', 'svg', 'exe', 'zip', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'json', 'html', 'php', 'sh']);

/** Legal forms. A line with one is a company, whatever else it looks like. */
const LEGAL =
  /\b(?:a\/s|aps|i\/s|k\/s|p\/s|ivs|as|asa|ab|oy|oyj|ag|gmbh|kg|ug|se|sa|sas|sarl|srl|spa|bv|nv|ltd|limited|llc|llp|lp|inc|incorporated|corp|corporation|co|plc|pty|pte|kk|group|holding|holdings)\.?$/i;

/** Ends in a legal form written like one ("Acme A/S", "Acme Inc."), not prose ending in "as" or "co". */
function hasLegalForm(text: string): boolean {
  const form = LEGAL.exec(text)?.[0];
  return !!form && text.includes(' ') && (form !== form.toLowerCase() || form.includes('/'));
}

/** Words of a job title. A line with one (and no legal form) is about a person. */
const TITLE =
  /\b(?:ceo|cto|cfo|coo|cmo|cpo|cro|ciso|vp|svp|evp|founder|co-founder|cofounder|owner|partner|director|manager|head|lead|chief|president|chairman|engineer|developer|designer|consultant|specialist|advisor|adviser|analyst|architect|recruiter|assistant|officer|intern|student|associate|executive|coordinator|administrator|direktør|ejer|stifter|medstifter|udvikler|konsulent|chef|leder|geschäftsführer|gründer|inhaber)\b/i;

/** "Title at Company" in the languages a list is likely to be in. */
const AT = /^(.+?)\s+(?:at|@|hos|bei|chez|en|bij|på)\s+(.{2,})$/i;

/** Screen furniture: buttons, column headers and labels of the pages people grab from. */
const NOISE = new Set(
  [
    'follow', 'following', 'unfollow', 'connect', 'message', 'more', 'see all', 'see more', 'show more', 'show all', 'view', 'view all',
    'view profile', 'website', 'visit website', 'visit', 'booth', 'stand', 'hall', 'exhibitor', 'exhibitors', 'exhibitor list',
    'sponsor', 'sponsors', 'partners', 'company', 'companies', 'company name', 'name', 'country', 'city', 'industry', 'location',
    'address', 'phone', 'email', 'e-mail', 'search', 'filter', 'filters', 'sort', 'sort by', 'results', 'page', 'next', 'previous',
    'back', 'about', 'home', 'contact', 'contact us', 'menu', 'login', 'log in', 'sign in', 'sign up', 'join', 'jobs', 'people',
    'posts', 'all filters', 'reset', 'apply', 'save', 'share', 'download', 'print', 'close', 'cancel', 'ok', 'yes', 'no', 'and',
    'or', 'the', 'category', 'categories', 'description', 'details', 'products', 'services', 'logo', 'promoted', 'sponsored',
    'emails', 'websites', 'contacts', 'found on', 'source', 'status', 'verified', 'valid', 'invalid', 'catch-all',
    'virksomhed', 'virksomheder', 'navn', 'land', 'by', 'adresse', 'telefon', 'søg', 'firma', 'firmenname', 'aussteller',
  ].map((w) => w.toLowerCase()),
);

/** Countries, the column next to the company on most exhibitor lists and directories. Lowercase. */
const COUNTRIES = new Set(
  `afghanistan albania algeria argentina armenia australia austria azerbaijan bahrain bangladesh belarus belgium bolivia
  bosnia brazil bulgaria cambodia cameroon canada chile china colombia croatia cuba cyprus czechia czech republic denmark
  ecuador egypt estonia ethiopia finland france georgia germany ghana greece greenland hong kong hungary iceland india
  indonesia iran iraq ireland israel italy japan jordan kazakhstan kenya korea south korea kosovo kuwait latvia lebanon
  lithuania luxembourg malaysia malta mexico moldova monaco mongolia montenegro morocco nepal netherlands the netherlands
  new zealand nigeria north macedonia norway oman pakistan panama peru philippines poland portugal qatar romania russia
  saudi arabia serbia singapore slovakia slovenia south africa spain sri lanka sweden switzerland taiwan thailand tunisia
  turkey türkiye ukraine united arab emirates uae united kingdom uk great britain england scotland wales united states usa
  us u.s. u.s.a. america uruguay uzbekistan venezuela vietnam faroe islands
  danmark sverige norge tyskland frankrig holland storbritannien deutschland schweiz österreich frankreich niederlande
  europe asia africa north america south america worldwide global international`
    .split(/\s+/)
    .filter(Boolean),
);
const COUNTRY_PHRASES = new Set([
  'czech republic', 'hong kong', 'south korea', 'the netherlands', 'new zealand', 'north macedonia', 'saudi arabia', 'south africa',
  'sri lanka', 'united arab emirates', 'united kingdom', 'great britain', 'united states', 'faroe islands', 'north america', 'south america',
]);

/** Common first names, for telling "Anna Berg" (a person) from "Anna Bike" (maybe not). Lowercase. */
const FIRST_NAMES = new Set(
  `james john robert michael william david richard joseph thomas charles christopher daniel matthew anthony mark donald steven paul
  andrew joshua kenneth kevin brian george timothy ronald edward jason jeffrey ryan jacob gary nicholas eric jonathan stephen larry
  justin scott brandon benjamin samuel gregory alexander frank patrick raymond jack dennis jerry tyler aaron jose adam nathan henry
  peter zachary douglas harold kyle noah ethan jeremy walter christian keith roger terry austin sean gerald carl harry dylan arthur
  lawrence jordan jesse bryan billy bruce gabriel joe logan albert willie alan eugene russell vincent philip bobby johnny bradley
  mary patricia jennifer linda elizabeth barbara susan jessica sarah karen lisa nancy betty sandra margaret ashley kimberly emily
  donna michelle carol amanda melissa deborah stephanie dorothy rebecca sharon laura cynthia amy kathleen angela shirley brenda emma
  anna nicole helen samantha katherine christine debra rachel carolyn janet maria olivia heather catherine diane julie victoria
  lauren kelly christina joan evelyn judith megan andrea cheryl hannah jacqueline martha madison teresa gloria sara janice ann
  kathryn abigail sophia frances jean alice judy isabella julia grace amber denise danielle marilyn beverly charlotte natalie
  theresa diana brittany doris kayla alexis lori marie jane claire chloe lucy ella mia ava zoe
  lars jens peter niels anders søren soren henrik morten mads rasmus jesper martin christian michael thomas kasper jakob jacob
  mikkel frederik emil oliver william lucas magnus mathias simon nikolaj kristian ole poul hans erik bo kim per steen torben flemming
  allan carsten claus brian rene jan karsten jørgen jorgen johannes troels ulrik anne kirsten hanne mette lene susanne camilla
  louise charlotte maria pia tina helle karina marianne birgitte dorte line ida sofie freja laura cecilie julie katrine signe nanna
  trine malene rikke gitte inge lotte maja astrid alma clara ellen karen sanne stine tove vibeke
  johan lars olof nils karl sven gustav axel björn bjorn fredrik mattias oskar viktor ola knut ingrid kari linnea elin ebba
  hans klaus jürgen jurgen wolfgang stefan andreas markus tobias florian sebastian matthias jonas felix maximilian lukas leon
  paul tim jan philipp dirk uwe frank heike sabine petra monika ursula birgit katharina lena lea leonie sophie marie hanna
  jean pierre louis michel philippe nicolas francois françois antoine julien guillaume thomas mathieu camille manon chloé lea
  pedro juan carlos luis miguel javier antonio manuel francisco alejandro diego pablo sergio jorge lucia sofia carmen laura
  marco luca giuseppe giovanni francesco alessandro andrea matteo lorenzo giulia francesca chiara sara
  jan pieter willem daan sem bram thijs ruben anouk sanne lotte fleur
  rahul amit raj vikram arjun rohan sanjay ravi priya anjali neha pooja divya sneha
  wei jun li ming hiroshi takashi yuki kenji sakura mohammed muhammad ahmed ali omar hassan fatima aisha`
    .split(/\s+/)
    .filter(Boolean),
);

/** Strips bullets, numbering, quotes, booth codes and a trailing separator off a segment. */
function tidy(segment: string): string {
  return segment
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(?:[-*•●▪·|>]|\d{1,4}[.)])\s+/, '')
    .replace(/^["'“‘](.*)["'”’]$/, '$1')
    .replace(/\s*[,;|·•-]?\s*(?:booth|stand|hall|stall|stand no\.?|booth no\.?|#)\s*[a-z]?\d[\w./-]*$/i, '')
    .replace(/[\s,;:|·•]+$/, '')
    .trim();
}

/** The domain a token names, if any, as a company domain (not a personal mailbox, not a file name). */
function tokenDomain(token: string): { domain: string; email: boolean } | null {
  const raw = token.replace(/^[(<[“"']+|[)>\]”"'.,;:!?]+$/g, '');
  const domain = itemDomain(raw);
  if (!domain) return null;
  const tld = domain.slice(domain.lastIndexOf('.') + 1);
  if (NOT_TLD.has(tld) || tld.length < 2) return null;
  const email = raw.includes('@') && !raw.includes('/');
  return { domain, email };
}

function words(text: string): string[] {
  return text.split(' ').filter(Boolean);
}

function isCapitalized(word: string): boolean {
  return /^\p{Lu}[\p{L}'’-]*\.?$/u.test(word);
}

/** "Anna Berg", "Lars H. Nielsen", "Jean-Pierre Dupont": a first name and one to three capitalized words. */
function looksLikePerson(text: string): boolean {
  const parts = words(text.replace(/,.*$/, ''));
  if (parts.length < 2 || parts.length > 4) return false;
  if (!parts.every(isCapitalized)) return false;
  const first = (parts[0] ?? '').toLowerCase().split('-')[0] ?? '';
  return FIRST_NAMES.has(first);
}

/** A segment that reads as a company name, or null. `person` is set when it reads as a person instead. */
function companyName(text: string): { name: string | null; person: boolean } {
  const name = text;
  if (name.length < 2) return { name: null, person: false };
  const lower = name.toLowerCase();
  // A header with an info glyph OCR read as a letter: "Emails O".
  const bare = lower.replace(/\s+\S$/, '');
  if (NOISE.has(bare) || NOISE.has(lower) || COUNTRIES.has(lower) || COUNTRY_PHRASES.has(lower)) return { name: null, person: false };
  const legal = hasLegalForm(name);

  // "Head of Sales at Acme": the company is after "at".
  const at = AT.exec(name);
  if (at?.[1] && at[2] && TITLE.test(at[1])) {
    return { name: companyName(at[2].replace(/\s*[·•|].*$/, '').trim()).name, person: true };
  }
  if (!legal && TITLE.test(name)) return { name: null, person: true };
  if (!legal && looksLikePerson(name)) return { name: null, person: true };

  if (name.length > 60) return { name: null, person: false };
  const parts = words(name);
  if (parts.length > 7) return { name: null, person: false };
  const letters = (name.match(/\p{L}/gu) ?? []).length;
  const digits = (name.match(/\d/g) ?? []).length;
  if (letters < 2 || digits > letters) return { name: null, person: false };
  // Counts, dates, prices and social proof: "1,204 followers", "2nd", "Mar 2024".
  if (/\b\d[\d,.]*\s*(?:k|m)?\s*(?:followers|employees|members|connections|ansatte|mitarbeiter|results|resultater)\b/i.test(name)) {
    return { name: null, person: false };
  }
  if (parts.some((w) => NOT_TLD.has(w.slice(w.lastIndexOf('.') + 1).toLowerCase()) && w.includes('.'))) return { name: null, person: false };
  if (/^(?:1st|2nd|3rd|\d+th)$/i.test(name) || /^\W/.test(name)) return { name: null, person: false };
  // Prose and descriptions start most words in lowercase; names start most in capitals.
  const connectors = /^(?:and|of|the|for|de|du|la|le|des|und|og|i|&|von|van|der|den|del|y|e|et)$/i;
  const lowercase = parts.filter((w) => /^\p{Ll}/u.test(w) && !connectors.test(w)).length;
  if (!legal && parts.length > 1 && lowercase > 0 && lowercase >= parts.length / 2) return { name: null, person: false };
  if (parts.length === 1 && /^\p{Ll}+$/u.test(name) && name.length < 4) return { name: null, person: false };
  return { name, person: false };
}

/**
 * The companies in `segments`: each segment is a line OCR read, or a column
 * of one when a line has wide gaps. Domains first in reading order, mixed with
 * names as they appear, deduplicated like a pasted list.
 */
export function extractCompanies(segments: string[]): Extracted {
  const items: GrabItem[] = [];
  const seen = new Set<string>();
  let people = 0;

  const add = (text: string, kind: GrabItem['kind']): void => {
    const key = kind === 'domain' ? text : text.toLowerCase().replace(/\s+/g, ' ');
    if (seen.has(key) || items.length >= MAX_ITEMS) return;
    seen.add(key);
    items.push({ text, kind });
  };

  for (const segment of segments) {
    const text = tidy(segment);
    if (!text) continue;

    // Domains anywhere in the segment. What is left may still name the company.
    let rest = text;
    let found = false;
    for (const token of words(text)) {
      const hit = tokenDomain(token);
      if (!hit) continue;
      found = true;
      rest = rest.replace(token, ' ');
      if (hit.email && FREE_MAIL.has(hit.domain)) {
        people++;
        continue;
      }
      if (FREE_MAIL.has(hit.domain)) continue;
      add(hit.domain, 'domain');
    }
    rest = tidy(rest.replace(/\s+/g, ' '));
    if (found && rest.length < 2) continue;

    const { name, person } = companyName(rest);
    if (person) people++;
    if (name) add(name, 'name');
  }
  return { items, people };
}

/** A word OCR read, with its left edge and width in image pixels. */
export interface OcrWord {
  text: string;
  x: number;
  width: number;
}

/**
 * Splits one OCR line into columns where the gap between two words is wider
 * than `gap` pixels, so a table row "Acme GmbH    B12    Germany" reads as
 * three segments instead of one run-on name.
 */
export function splitColumns(line: OcrWord[], gap: number): string[] {
  const out: string[] = [];
  let current: string[] = [];
  let end = Number.NaN;
  for (const word of line) {
    if (current.length > 0 && word.x - end > gap) {
      out.push(current.join(' '));
      current = [];
    }
    current.push(word.text);
    end = word.x + word.width;
  }
  if (current.length > 0) out.push(current.join(' '));
  return out;
}
