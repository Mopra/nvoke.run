// Personal address patterns: how a company builds anna.berg@ from Anna Berg.
// Names become local parts (lowercase, ASCII, with the usual spellings of
// æ, ø, å, ü, ö, ä and ß), a pattern is inferred from addresses whose owner
// is known, and candidates for a named person come out in the order most
// likely to exist: the domain's own pattern when known, else a global prior.

import { isFirstName, parseName } from './extract.js';

export type PatternId =
  | 'first'
  | 'first.last'
  | 'firstlast'
  | 'flast'
  | 'f.last'
  | 'firstl'
  | 'first_last'
  | 'last'
  | 'first-last'
  | 'last.first'
  | 'lastf'
  | 'first.l'
  | 'lastfirst'
  | 'l.first';

/**
 * How common each pattern is, most common first. first@ leads because small
 * companies (most of nvoke's results) use it most; first.last@ is the norm
 * at larger ones.
 */
export const PATTERN_PRIOR: readonly PatternId[] = [
  'first',
  'first.last',
  'firstlast',
  'flast',
  'f.last',
  'firstl',
  'first_last',
  'last',
  'first-last',
  'last.first',
  'lastf',
  'first.l',
  'lastfirst',
  'l.first',
];

export interface NamedPerson {
  firstName: string;
  lastName: string;
}

/** Letters with more than one ASCII spelling, the usual one first. */
const VARIANTS: Record<string, string[]> = {
  ø: ['o', 'oe'],
  æ: ['ae'],
  å: ['a', 'aa'],
  ü: ['ue', 'u'],
  ö: ['oe', 'o'],
  ä: ['ae', 'a'],
  ß: ['ss'],
  œ: ['oe'],
  ł: ['l'],
  đ: ['d'],
  ð: ['d'],
  þ: ['th'],
  ı: ['i'],
};

/** At most this many spellings per name part, so a name full of umlauts stays cheap. */
const MAX_SPELLINGS = 4;

/** ASCII spellings of one word, the usual one first: "Søren" gives soren and soeren. */
function spellings(word: string): string[] {
  let out = [''];
  // NFC first, so a composed ü and a u plus combining diaeresis both hit the VARIANTS table.
  for (const ch of word.normalize('NFC').toLowerCase().replace(/['’`´]/g, '')) {
    const options = VARIANTS[ch] ?? [ch.normalize('NFD').replace(/[̀-ͯ]/g, '')];
    const next: string[] = [];
    for (const prefix of out) for (const o of options) next.push(prefix + o);
    out = [...new Set(next)].slice(0, MAX_SPELLINGS);
  }
  return out.map((s) => s.replace(/[^a-z0-9-]/g, '')).filter(Boolean);
}

/**
 * Local part spellings of a first name: the first given name only ("Anna
 * Maria" is anna), hyphenated names joined, kept and cut to their first part
 * (Anne-Marie gives annemarie, anne-marie and anne).
 */
export function firstNameParts(name: string): string[] {
  const word = name.trim().split(/\s+/)[0] ?? '';
  return nameForms(word, 'first');
}

/**
 * Local part spellings of a last name: particles joined in (van der Berg is
 * vanderberg, then berg), hyphenated names joined, kept and cut to either part.
 */
export function lastNameParts(name: string): string[] {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const forms = [...nameForms(words.join(''), 'last')];
  if (words.length > 1) forms.push(...nameForms(words[words.length - 1]!, 'last'));
  return [...new Set(forms)];
}

function nameForms(word: string, side: 'first' | 'last'): string[] {
  const out: string[] = [];
  for (const s of spellings(word)) {
    const parts = s.split('-').filter(Boolean);
    if (parts.length <= 1) {
      out.push(parts[0] ?? '');
      continue;
    }
    out.push(parts.join(''), parts.join('-'));
    if (side === 'first') out.push(parts[0]!);
    else out.push(parts[0]!, parts[parts.length - 1]!);
  }
  return [...new Set(out.filter(Boolean))];
}

/** The local part of `pattern` for one spelling of the first and last name. */
export function applyPattern(pattern: PatternId, first: string, last: string): string | null {
  const f = first[0] ?? '';
  const l = last[0] ?? '';
  if (!first) return null;
  if (!last && pattern !== 'first') return null;
  switch (pattern) {
    case 'first':
      return first;
    case 'first.last':
      return `${first}.${last}`;
    case 'firstlast':
      return `${first}${last}`;
    case 'flast':
      return `${f}${last}`;
    case 'f.last':
      return `${f}.${last}`;
    case 'firstl':
      return `${first}${l}`;
    case 'first_last':
      return `${first}_${last}`;
    case 'last':
      return last;
    case 'first-last':
      return `${first}-${last}`;
    case 'last.first':
      return `${last}.${first}`;
    case 'lastf':
      return `${last}${f}`;
    case 'first.l':
      return `${first}.${l}`;
    case 'lastfirst':
      return `${last}${first}`;
    case 'l.first':
      return `${l}.${first}`;
  }
}

/** Every local part a pattern can give for a person, the usual spelling first. */
function localsFor(person: NamedPerson, pattern: PatternId): string[] {
  const out: string[] = [];
  for (const first of firstNameParts(person.firstName)) {
    for (const last of lastNameParts(person.lastName).concat(person.lastName.trim() ? [] : [''])) {
      const local = applyPattern(pattern, first, last);
      if (local) out.push(local);
    }
  }
  return [...new Set(out)];
}

export interface KnownPair extends NamedPerson {
  /** The local part of an address that person is known to own. */
  local: string;
}

export interface InferredPattern {
  pattern: PatternId;
  /** Known addresses the pattern explains. */
  support: number;
  /** Known addresses looked at. */
  total: number;
}

/**
 * The pattern that explains most of the known addresses, ties broken by the
 * prior. Null when none explains any. One address that is both first@ and
 * last@ (a person called Jensen Jensen) counts for both.
 */
export function inferPattern(pairs: KnownPair[]): InferredPattern | null {
  const counts = new Map<PatternId, number>();
  let total = 0;
  for (const pair of pairs) {
    const local = pair.local.toLowerCase();
    total++;
    for (const pattern of PATTERN_PRIOR) {
      if (localsFor(pair, pattern).includes(local)) counts.set(pattern, (counts.get(pattern) ?? 0) + 1);
    }
  }
  let best: InferredPattern | null = null;
  for (const pattern of PATTERN_PRIOR) {
    const support = counts.get(pattern) ?? 0;
    if (support > 0 && (!best || support > best.support)) best = { pattern, support, total };
  }
  return best;
}

/**
 * The person an existing address belongs to, and by which pattern. Null
 * when nobody matches, or when two people match equally well (two Annas and
 * anna@). Patterns are tried in prior order, so a hit on first.last@ wins
 * over another person's first@ only when it is the sole match at its rank.
 */
export function matchPerson<T extends NamedPerson>(localPart: string, people: T[]): { person: T; pattern: PatternId } | null {
  const local = localPart.toLowerCase();
  // Specific patterns first: anna.berg@ is Anna Berg even when another Anna works there.
  const order: PatternId[] = [...PATTERN_PRIOR.filter((p) => p !== 'first' && p !== 'last'), 'first', 'last'];
  for (const pattern of order) {
    const hits = people.filter((p) => localsFor(p, pattern).includes(local));
    if (hits.length === 1) return { person: hits[0]!, pattern };
    if (hits.length > 1) return null;
  }
  return null;
}

export interface Candidate {
  local: string;
  pattern: PatternId;
}

/**
 * Local parts to try for a person, most likely first. With a known pattern
 * that is one or two: the usual spelling, then another spelling of the same
 * pattern when the name has one (Søren: soren, then soeren), else the next
 * pattern in the prior. Without one, the prior in order with the usual
 * spelling, and the first other spelling of those two in third place.
 */
export function candidates(person: NamedPerson, pattern: PatternId | null, max: number): Candidate[] {
  const out: Candidate[] = [];
  const seen = new Set<string>();
  const add = (local: string | undefined, p: PatternId) => {
    if (!local || seen.has(local) || !/^[a-z0-9][a-z0-9._-]*$/.test(local)) return;
    seen.add(local);
    out.push({ local, pattern: p });
  };
  if (pattern) {
    const locals = localsFor(person, pattern);
    add(locals[0], pattern);
    if (locals[1]) add(locals[1], pattern);
    else {
      const next = PATTERN_PRIOR.find((p) => p !== pattern && localsFor(person, p).length > 0);
      if (next) add(localsFor(person, next)[0], next);
    }
    return out.slice(0, Math.min(max, 2));
  }
  for (const p of PATTERN_PRIOR) {
    const locals = localsFor(person, p);
    add(locals[0], p);
    if (out.length === 2) {
      // The other spelling of the name (Müller: mueller, then muller) right after the two most likely patterns.
      const alt = out.map((c) => ({ pattern: c.pattern, local: localsFor(person, c.pattern)[1] })).find((c) => c.local);
      if (alt) add(alt.local, alt.pattern);
    }
    if (out.length >= max) break;
  }
  return out.slice(0, max);
}

/** The separators of a two part local part that names a person. */
const NAME_LOCAL = /^([a-z]{2,20})([._-])([a-z]{2,25})$/;

/** Second halves of double first names that are not common first names on their own: Karl-Heinz, Hans-Jürgen. */
const DOUBLE_FIRST_SECOND = new Set(['heinz', 'juergen', 'jurgen', 'joergen', 'jorgen', 'dieter', 'uwe', 'olof', 'kristin', 'christin', 'luc', 'yves', 'baptiste', 'francois', 'claude', 'noel']);

const capitalize = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);

/**
 * A person's name read from a personal address nobody on the site was
 * printed for: anna.berg@, anna_berg@ and anna-berg@ give Anna Berg, when
 * both parts read as a name (parseName: no company, place or title words)
 * and the first is a common first name or a first name the site printed.
 * A lone first name (max@), a double first name (anne-marie@, hans-peter@)
 * or initials give nothing. A name read this way never teaches a domain its
 * pattern (worker/people-job.ts learns only from printed people).
 */
export function nameFromLocal(localPart: string, printed: NamedPerson[] = []): NamedPerson | null {
  const m = NAME_LOCAL.exec(localPart.toLowerCase().split('+')[0] ?? '');
  if (!m) return null;
  const [, first, sep, last] = m as unknown as [string, string, string, string];
  const known = isFirstName(first) || printed.some((p) => firstNameParts(p.firstName).includes(first));
  if (!known || first === last) return null;
  // Anne-Marie, Hans-Peter, Karl-Heinz: one first name, not a first and a last.
  if (sep === '-' && (isFirstName(last) || DOUBLE_FIRST_SECOND.has(last))) return null;
  const name = parseName(`${capitalize(first)} ${capitalize(last)}`);
  return name ? { firstName: name.firstName, lastName: name.lastName } : null;
}
