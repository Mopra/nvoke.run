import { beforeEach, describe, expect, it } from 'vitest';
import type { FoundPerson } from '@nvoke/shared/crawl';
import { AiError, type Ai, type StructuredRequest } from '../ai/client.js';
import { silentLog } from '../testing/fakes.js';
import { needsPeopleLlm, peopleFromText, type ClaudePeople } from './people-llm.js';
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
