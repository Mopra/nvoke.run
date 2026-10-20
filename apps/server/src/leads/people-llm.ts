// The people step's fallback: when the crawl's heuristics found no decision
// maker on a site that has a team, about or imprint page, Claude reads the
// text of those pages once and names the company's own people. The crawl
// sends the pages without quotes and testimonials. Claude is asked only when
// the pages name people the rules could not read (needsPeopleLlm), and reads
// only the lines around those names (peopleExcerpt). Every name Claude gives
// must be printed on the pages as given, a title must be printed close to
// the name, and the crawl's own title checks apply: a title held at another
// company drops the person.

import type { Logger } from 'pino';
import { z } from 'zod';
import { isDecisionMaker } from '@nvoke/shared';
import {
  PEOPLE_MAX,
  checkTitle,
  foldTitle,
  hasTitleWord,
  isFirstName,
  mergePeople,
  ownCompanyOf,
  parseName,
  personKey,
  seniorityOf,
  type FoundPerson,
} from '@nvoke/shared/crawl';
import { AiError, type Ai } from '../ai/client.js';
import { sharePeopleText } from './crawl.js';
import type { SitePage } from './page-text.js';

/** People Claude may name per call. The crawl keeps PEOPLE_MAX per company. */
const ANSWER_MAX = 20;

/** What Claude answers. */
export const ClaudePeople = z.object({
  people: z
    .array(
      z.object({
        name: z.string().describe('The full name, exactly as printed on the page.'),
        title: z.string().nullable().describe('The job title, exactly as printed next to the name, or null.'),
        sourceUrl: z.string().nullable().describe('The url of the page the name is on, exactly as given.'),
      }),
    )
    .max(ANSWER_MAX),
});
export type ClaudePeople = z.infer<typeof ClaudePeople>;

const SYSTEM = `You read pages of one company's own website and list the people who work at or own that company: founders, owners, partners, directors, managers and employees, with their job titles.

Rules:
- Only the company's own people. Never clients, customers, people quoted in testimonials or reviews, authors of quotes, investors, journalists, or people at other companies.
- Copy each name exactly as printed, letter for letter. Never guess, complete or translate a name. A first name alone is not enough: skip people without a last name.
- Copy the title exactly as printed next to the name, in the page's language, or null when the page gives none.
- Give the url of the page the name is on, exactly as given.
- Name at most ${ANSWER_MAX} people, the most senior first.
- When the pages name nobody, answer an empty list.`;

/** A run of capitalized words, particles between: where a name sits in running text. */
const NAME_RUN = /\p{Lu}[\p{Ll}'’]+(?:-\p{Lu}\p{Ll}+)?(?:\s+(?:(?:van|von|der|den|de|da|di|du|la|le|del|dos|af|zu|ten|ter)\s+){0,2}\p{Lu}[\p{Ll}'’]+(?:-\p{Lu}\p{Ll}+)?){1,4}/gu;
/** Verbs that tell who started the company, folded: "founded by", "grundlagt af", "gegründet von". */
const FOUNDED = /\b(founded|co-?founded|started|grundlagt|grundlagde|startede|gegrundet|grundete|grundade|grunnla|opgericht|richtte|fonde|fondee|fundad[oa]|fondat[oa]|zalozyl[a]?)\b/;
/** Characters on each side of a name that count as around it. */
const AROUND = 80;
/** A neighbouring line short enough to be a card's title rather than prose. */
const SHORT_LINE = 90;

interface Mention {
  key: string;
  /** Which page and line of `texts` it is on, and where in the line. */
  page: number;
  line: number;
  at: number;
  end: number;
  /** The first name is a common one. */
  known: boolean;
  /** A word of the title lexicon is printed around it. */
  titled: boolean;
  /** A founder, owner, CEO or director title, or a founding verb, is printed around it. */
  decisive: boolean;
}

/**
 * The name in a run of capitalized words, words around it dropped:
 * "Kontakt Mette Hansen", "Mette Hansen Stifter". Offsets are within the run.
 */
function nameIn(run: string): { name: { firstName: string; lastName: string }; at: number; end: number } | null {
  const tokens = run.split(/\s+/);
  const offsets: number[] = [];
  for (let i = 0, at = 0; i < tokens.length; at += tokens[i]!.length + 1, i++) offsets.push(at);
  for (let i = 0; i < tokens.length - 1; i++) {
    for (let j = tokens.length; j >= i + 2; j--) {
      const name = parseName(tokens.slice(i, j).join(' '));
      if (name) return { name, at: offsets[i]!, end: offsets[j - 1]! + tokens[j - 1]!.length };
    }
  }
  return null;
}

/** The names the pages print, each with what is printed around it. */
function mentionsIn(texts: SitePage[]): Mention[] {
  const out: Mention[] = [];
  texts.forEach((page, p) => {
    const lines = page.text.split('\n');
    lines.forEach((line, l) => {
      const scan = line.slice(0, 2_000);
      for (const m of scan.matchAll(NAME_RUN)) {
        const found = nameIn(m[0]);
        if (!found) continue;
        const at = m.index + found.at;
        const end = m.index + found.end;
        const near = [lines[l - 1], lines[l + 1]].filter((n): n is string => n !== undefined && n.length <= SHORT_LINE);
        const around = [scan.slice(Math.max(0, at - AROUND), at), scan.slice(end, end + AROUND), ...near].join(' \n ');
        const titled = hasTitleWord(around);
        const known = isFirstName(found.name.firstName);
        const decisive = (titled && isDecisionMaker(seniorityOf(around))) || (known && FOUNDED.test(foldTitle(around)));
        out.push({ key: personKey(found.name), page: p, line: l, at, end, known, titled, decisive });
      }
    });
  });
  return out;
}

/**
 * Whether the people step should ask Claude. Not when the rules found a
 * decision maker, and not on every miss: only when the people pages print
 * names the rules did not read, and those look like the company's people. A
 * founding verb or a decision maker's title by one name is enough ("Mette
 * startede bureauet i 2009"); otherwise at least two names, each a common
 * first name or with a title word around it. An about page of prose about
 * the business, an imprint of company data or one name in passing is not.
 */
export function needsPeopleLlm(people: FoundPerson[], texts: SitePage[]): boolean {
  if (people.some((p) => isDecisionMaker(p.seniority))) return false;
  const read = new Set(people.map(personKey));
  const fresh = mentionsIn(texts).filter((m) => !read.has(m.key) && (m.known || m.titled));
  if (fresh.some((m) => m.decisive)) return true;
  return new Set(fresh.map((m) => m.key)).size >= 2;
}

/** Characters of the people pages Claude reads at most, all pages together. */
export const EXCERPT_MAX = 3_000;
/** Lines kept on each side of a line that names someone: the title and a line of bio. */
const EXCERPT_LINES = 2;
/** A kept line is cut to this, around its names when it names any. */
const LINE_MAX = 400;

/**
 * The people pages cut to the lines around the names they print, a gap
 * marked with "...", within EXCERPT_MAX characters. A page that names
 * nobody is left out. Claude reads this, not the whole pages: the names and
 * titles are all it needs.
 */
export function peopleExcerpt(texts: SitePage[], max = EXCERPT_MAX): SitePage[] {
  const mentions = mentionsIn(texts).filter((m) => m.known || m.titled);
  const pages = texts.map((page, p) => {
    const lines = page.text.split('\n');
    const keep = new Set<number>();
    for (const m of mentions) {
      if (m.page !== p) continue;
      for (let l = Math.max(0, m.line - EXCERPT_LINES); l <= Math.min(lines.length - 1, m.line + EXCERPT_LINES); l++) keep.add(l);
    }
    const out: string[] = [];
    let last = -1;
    for (const l of [...keep].sort((a, b) => a - b)) {
      if (l > last + 1) out.push('...');
      out.push(cutLine(lines[l]!, mentions.filter((m) => m.page === p && m.line === l)));
      last = l;
    }
    if (last >= 0 && last < lines.length - 1) out.push('...');
    return { ...page, text: out.join('\n') };
  });
  return sharePeopleText(
    pages.filter((p) => p.text.length > 0),
    max,
  );
}

/** A long line cut to LINE_MAX: around the names in it, or its start. */
function cutLine(line: string, names: Mention[]): string {
  if (line.length <= LINE_MAX) return line;
  if (names.length === 0) return line.slice(0, LINE_MAX / 2);
  const from = Math.max(0, Math.min(...names.map((m) => m.at)) - AROUND * 1.5);
  return line.slice(from, Math.min(line.length, from + LINE_MAX));
}

function attr(v: string): string {
  return v.replace(/[<>"]/g, ' ');
}

export function peoplePrompt(domain: string, texts: SitePage[]): string {
  const pages = texts.map((t) => `<page url="${attr(t.url)}" title="${attr(t.title)}">\n${t.text}\n</page>`).join('\n');
  return `The company's website is ${domain}. The parts of its pages that name people ("..." marks lines left out):\n\n${pages}\n\nList the company's own people.`;
}

/** How far from the name a title may be printed and still be that person's. */
const TITLE_NEAR = 200;

/** Whitespace collapsed, for finding a name in the page text. */
function squash(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** Whether the title is printed within TITLE_NEAR characters of a mention of the name. */
function printedNear(text: string, name: string, title: string): boolean {
  const lower = text.toLowerCase();
  const t = title.toLowerCase();
  for (let at = text.indexOf(name); at >= 0; at = text.indexOf(name, at + 1)) {
    const from = Math.max(0, at - TITLE_NEAR);
    if (lower.slice(from, at + name.length + TITLE_NEAR + t.length).includes(t)) return true;
  }
  return false;
}

export interface PeopleLlmDeps {
  /** Without it the step is skipped. */
  ai?: Ai;
  log: Logger;
}

/**
 * The people Claude finds on the pages, checked against them: a name must be
 * printed on the pages exactly as given and read as a person's name, and a
 * title not printed near the name is dropped. Null when Claude was not
 * asked or failed (no Claude, the account's budget is spent, an error), so
 * the caller may ask again later.
 */
export async function peopleFromText(
  deps: PeopleLlmDeps,
  req: { userId: string; domain: string; texts: SitePage[] },
): Promise<FoundPerson[] | null> {
  const texts = req.texts.filter((t) => t.text.trim().length > 0);
  if (!deps.ai || texts.length === 0) return null;
  const excerpt = peopleExcerpt(texts);
  if (excerpt.length === 0) return null;
  if (!(await deps.ai.ready(req.userId))) return null;
  let answer: ClaudePeople;
  try {
    const res = await deps.ai.structured({
      userId: req.userId,
      task: 'people',
      tier: 'bulk',
      system: SYSTEM,
      prompt: peoplePrompt(req.domain, excerpt),
      schema: ClaudePeople,
      toolName: 'save_people',
      toolDescription: "Saves the company's own people with their titles.",
      // Copying names and titles needs no reasoning, and reasoning tokens are billed as output.
      // The answer is at most ANSWER_MAX entries of about 35 tokens each (name, title, url
      // and the JSON around them), 65 with an 80 character title and url: 1,500 leaves room.
      maxTokens: 1500,
    });
    answer = res.data;
  } catch (err) {
    if (!(err instanceof AiError)) throw err;
    deps.log.warn({ err, userId: req.userId, domain: req.domain }, 'people: Claude failed');
    return null;
  }

  const own = ownCompanyOf(`https://${req.domain}/`);
  const pages = texts.map((t) => ({ url: t.url, text: squash(t.text) }));
  const out: FoundPerson[] = [];
  for (const p of answer.people) {
    const name = squash(p.name);
    const page = pages.find((pg) => pg.url === p.sourceUrl && pg.text.includes(name)) ?? pages.find((pg) => pg.text.includes(name));
    if (!page) continue;
    const parsed = parseName(name);
    if (!parsed) continue;
    const raw = p.title ? squash(p.title) : '';
    let title: string | null = null;
    if (raw) {
      const checked = checkTitle(raw, own);
      if (checked.elsewhere) continue;
      title = checked.title && printedNear(page.text, name, checked.title) ? checked.title : null;
    }
    out.push({ ...parsed, title, seniority: seniorityOf(title), sourceUrl: page.url });
  }
  deps.log.debug({ domain: req.domain, asked: answer.people.length, kept: out.length }, 'people: Claude read the pages');
  return mergePeople(out, PEOPLE_MAX);
}
