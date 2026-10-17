// The people step's fallback: when the crawl's heuristics found no decision
// maker on a site that has a team, about or imprint page, Claude reads the
// text of those pages once and names the company's own people. The crawl
// sends the pages without quotes and testimonials. Every name Claude gives
// must be printed on the pages as given, a title must be printed close to
// the name, and the crawl's own title checks apply: a title held at another
// company drops the person.

import type { Logger } from 'pino';
import { z } from 'zod';
import { isDecisionMaker } from '@nvoke/shared';
import { PEOPLE_MAX, checkTitle, mergePeople, ownCompanyOf, parseName, seniorityOf, type FoundPerson } from '@nvoke/shared/crawl';
import { AiError, type Ai } from '../ai/client.js';
import type { SitePage } from './page-text.js';

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
    .max(40),
});
export type ClaudePeople = z.infer<typeof ClaudePeople>;

const SYSTEM = `You read pages of one company's own website and list the people who work at or own that company: founders, owners, partners, directors, managers and employees, with their job titles.

Rules:
- Only the company's own people. Never clients, customers, people quoted in testimonials or reviews, authors of quotes, investors, journalists, or people at other companies.
- Copy each name exactly as printed, letter for letter. Never guess, complete or translate a name. A first name alone is not enough: skip people without a last name.
- Copy the title exactly as printed next to the name, in the page's language, or null when the page gives none.
- Give the url of the page the name is on, exactly as given.
- When the pages name nobody, answer an empty list.`;

/** Whether the people step should ask Claude: no decision maker found, but a people page was read. */
export function needsPeopleLlm(people: FoundPerson[], texts: SitePage[]): boolean {
  return !people.some((p) => isDecisionMaker(p.seniority)) && texts.some((t) => t.text.trim().length > 0);
}

function attr(v: string): string {
  return v.replace(/[<>"]/g, ' ');
}

export function peoplePrompt(domain: string, texts: SitePage[]): string {
  const pages = texts.map((t) => `<page url="${attr(t.url)}" title="${attr(t.title)}">\n${t.text}\n</page>`).join('\n');
  return `The company's website is ${domain}. Its pages:\n\n${pages}\n\nList the company's own people.`;
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
  if (!(await deps.ai.ready(req.userId))) return null;
  let answer: ClaudePeople;
  try {
    const res = await deps.ai.structured({
      userId: req.userId,
      task: 'people',
      tier: 'bulk',
      system: SYSTEM,
      prompt: peoplePrompt(req.domain, texts),
      schema: ClaudePeople,
      toolName: 'save_people',
      toolDescription: "Saves the company's own people with their titles.",
      effort: 'low',
      maxTokens: 3000,
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
