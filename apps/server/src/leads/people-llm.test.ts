import { beforeEach, describe, expect, it } from 'vitest';
import type { FoundPerson } from '@nvoke/shared/crawl';
import { AiError, type Ai, type StructuredRequest } from '../ai/client.js';
import { silentLog } from '../testing/fakes.js';
import { EXCERPT_MAX, needsPeopleLlm, peopleExcerpt, peopleFromText, type ClaudePeople } from './people-llm.js';
import type { SitePage } from './page-text.js';

const team: SitePage = {
  url: 'https://acme.dk/om-os',
  title: 'Om os',
  description: '',
  text: 'Vi er et lille bureau i Aarhus.\nMette Krogh Hansen\nStifter og adm. direktør\nJonas Berg\nUdvikler\n"Fantastisk samarbejde" Lise Holm, Kunde A/S',
};

describe('needsPeopleLlm', () => {
  const person = (seniority: FoundPerson['seniority']): FoundPerson => ({ firstName: 'A', lastName: 'B', title: null, seniority, sourceUrl: null });

  it('asks only when no decision maker was found and a people page was read', () => {
    expect(needsPeopleLlm([], [team])).toBe(true);
    expect(needsPeopleLlm([person('staff')], [team])).toBe(true);
    expect(needsPeopleLlm([person('director')], [team])).toBe(false);
    expect(needsPeopleLlm([], [])).toBe(false);
    expect(needsPeopleLlm([], [{ ...team, text: ' ' }])).toBe(false);
  });

  const page = (lines: string[], url = 'https://acme.dk/om-os'): SitePage => ({ url, title: 'Om os', description: '', text: lines.join('\n') });

  it('skips pages that name nobody the rules missed', () => {
    for (const lines of [
      // An about page of prose about the business.
      ['Om os', 'Vi er et digitalt bureau i Aarhus, grundlagt i 2009.', 'Vi hjælper virksomheder med Google Ads, SEO og Digital Marketing.', 'Kontakt os i dag.'],
      // An imprint of company data.
      ['Impressum', 'Acme GmbH', 'Musterstraße 1', '20095 Hamburg', 'Registergericht: Amtsgericht Hamburg', 'USt-IdNr. DE123456789'],
      // Services, clients and places in capitals.
      ['Our Work', 'Case Study', 'Novo Nordisk', 'Carlsberg Group', 'Brand Strategy', 'New York Office', 'San Francisco'],
      // One name in passing, no title.
      ['Spørgsmål? Skriv til Jonas Berg på info@acme.dk.'],
    ]) {
      expect(needsPeopleLlm([], [page(lines)]), lines.join(' / ')).toBe(false);
    }
  });

  it('skips names the rules already read', () => {
    const read: FoundPerson[] = [
      { firstName: 'Jonas', lastName: 'Berg', title: 'Udvikler', seniority: 'staff', sourceUrl: null },
      { firstName: 'Sofie', lastName: 'Lund', title: 'Designer', seniority: 'staff', sourceUrl: null },
    ];
    expect(needsPeopleLlm(read, [page(['Vores team', 'Jonas Berg', 'Udvikler', 'Sofie Lund', 'Designer'])])).toBe(false);
  });

  it('asks on team and about pages that name people the rules could not read', () => {
    // A founder's story in prose.
    expect(needsPeopleLlm([], [page(['Mette Krogh Hansen startede bureauet i 2009 efter ti år i reklamebranchen.'])])).toBe(true);
    expect(needsPeopleLlm([], [page(['Acme was founded in 2012 by Sarah Wood, who still runs the studio.'])])).toBe(true);
    // A team list whose titles the rules do not know.
    expect(needsPeopleLlm([], [page(['Holdet', 'Mette Hansen', 'Kok', 'Jonas Berg', 'Lagerarbejder', 'Sofie Lund', 'Tjener'], 'https://acme.dk/team')])).toBe(true);
    // A bio that names the boss in a sentence.
    expect(needsPeopleLlm([], [page(['Meet the team', 'Our studio is led by Xiao Chen, our managing director since 2015.'])])).toBe(true);
  });
});

describe('peopleExcerpt', () => {
  const prose = (n: number) => Array.from({ length: n }, (_, i) => `Vi arbejder med strategi, design og udvikling for kunder i hele landet, afsnit ${i}.`);

  it('keeps the lines around the names and leaves the rest of the page out', () => {
    const long: SitePage = {
      url: 'https://acme.dk/om-os',
      title: 'Om os',
      description: '',
      text: [...prose(40), 'Vores folk', 'Mette Krogh Hansen', 'Stifter', 'Jonas Berg', 'Udvikler', ...prose(40)].join('\n'),
    };
    expect(long.text.length).toBeGreaterThan(6_000);
    const [cut] = peopleExcerpt([long]);
    expect(cut!.text.length).toBeLessThan(800);
    expect(cut!.text).toContain(['Mette Krogh Hansen', 'Stifter', 'Jonas Berg', 'Udvikler'].join('\n'));
    expect(cut!.text.startsWith('...')).toBe(true);
    expect(cut!.text).not.toContain('afsnit 10.');
  });

  it('stays within EXCERPT_MAX across pages and leaves out a page that names nobody', () => {
    const team = Array.from({ length: 80 }, (_, i) => [`Peter Jensen${'abcdefghij'[i % 10]}sen`, 'Konsulent med speciale i ting']).flat();
    const pages = peopleExcerpt([
      { url: 'https://acme.dk/team', title: 'Team', description: '', text: team.join('\n') },
      { url: 'https://acme.dk/impressum', title: 'Impressum', description: '', text: ['Acme ApS', 'CVR 12345678'].join('\n') },
    ]);
    expect(pages.map((p) => p.url)).toEqual(['https://acme.dk/team']);
    expect(pages.reduce((n, p) => n + p.text.length, 0)).toBeLessThanOrEqual(EXCERPT_MAX);
  });
});

describe('peopleFromText', () => {
  let calls: StructuredRequest<never>[];
  let reply: ClaudePeople | Error;
  let ready: boolean;

  const ai: Ai = {
    ready: async () => ready,
    async structured(req) {
      calls.push(req as StructuredRequest<never>);
      if (reply instanceof Error) throw reply;
      return { data: req.schema.parse(reply), model: 'fake', usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }, costUsd: 0 };
    },
  };

  beforeEach(() => {
    calls = [];
    ready = true;
  });

  it('asks Haiku once for the account and keeps only names printed on the pages', async () => {
    reply = {
      people: [
        { name: 'Jonas Berg', title: 'Udvikler', sourceUrl: team.url },
        { name: 'Mette Krogh Hansen', title: 'Stifter og adm. direktør', sourceUrl: team.url },
        // Not on the page as given.
        { name: 'Mette Hansen', title: 'CEO', sourceUrl: team.url },
        { name: 'Peter Jensen', title: 'Partner', sourceUrl: team.url },
        // On the page, but a title that is not.
        { name: 'Lise Holm', title: 'Marketing Director', sourceUrl: team.url },
      ],
    };
    const people = await peopleFromText({ ai, log: silentLog }, { userId: 'alice', domain: 'acme.dk', texts: [team] });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ userId: 'alice', task: 'people', tier: 'bulk' });
    expect(calls[0]!.prompt).toContain('<page url="https://acme.dk/om-os" title="Om os">');
    expect(calls[0]!.maxTokens).toBeLessThanOrEqual(1500);
    expect(calls[0]!.effort).toBeUndefined();
    expect(people).toEqual([
      { firstName: 'Mette', lastName: 'Krogh Hansen', title: 'Stifter og adm. direktør', seniority: 'founder', sourceUrl: team.url },
      { firstName: 'Jonas', lastName: 'Berg', title: 'Udvikler', seniority: 'staff', sourceUrl: team.url },
      { firstName: 'Lise', lastName: 'Holm', title: null, seniority: null, sourceUrl: team.url },
    ]);
  });

  it('drops a title not printed near the name, and a person whose title is at another company', async () => {
    const far: SitePage = { ...team, text: `Mette Krogh Hansen
${'Vi laver hjemmesider. '.repeat(20)}
Partner
Ole Berg
CEO, Clientco Inc` };
    reply = {
      people: [
        { name: 'Mette Krogh Hansen', title: 'Partner', sourceUrl: far.url },
        { name: 'Ole Berg', title: 'CEO, Clientco Inc', sourceUrl: far.url },
      ],
    };
    const people = await peopleFromText({ ai, log: silentLog }, { userId: 'alice', domain: 'acme.dk', texts: [far] });
    expect(people).toEqual([{ firstName: 'Mette', lastName: 'Krogh Hansen', title: null, seniority: null, sourceUrl: far.url }]);
  });

  it('skips without Claude, with a spent budget, and when Claude fails', async () => {
    reply = { people: [{ name: 'Jonas Berg', title: null, sourceUrl: null }] };
    expect(await peopleFromText({ log: silentLog }, { userId: 'alice', domain: 'acme.dk', texts: [team] })).toBeNull();
    ready = false;
    expect(await peopleFromText({ ai, log: silentLog }, { userId: 'alice', domain: 'acme.dk', texts: [team] })).toBeNull();
    ready = true;
    reply = new AiError('refusal', 'no');
    expect(await peopleFromText({ ai, log: silentLog }, { userId: 'alice', domain: 'acme.dk', texts: [team] })).toBeNull();
    expect(calls).toHaveLength(1);
  });
});
