import { describe, expect, it } from 'vitest';
import { classifyMail } from './classify.js';
import { detectLanguage, footer, FOOTER_LANGUAGES, FOOTER_LINES, OPT_OUT_LINES, signatureFor, WHY_LINES, withFooter, type FooterLanguage } from './footer.js';
import type { IncomingMail } from './types.js';

const reply = (text: string): IncomingMail => ({
  folder: 'INBOX',
  uid: 1,
  messageId: '<r@x>',
  inReplyTo: null,
  references: [],
  from: 'anna@acme.com',
  to: ['me@sender.io'],
  subject: 'Re: booking tools',
  date: new Date('2026-10-20T10:00:00Z'),
  headers: {},
  text,
  deliveryStatus: null,
});

describe('footer', () => {
  it('has at least 8 plain variants of each line, with no dashes as punctuation', () => {
    expect(WHY_LINES.length).toBeGreaterThanOrEqual(8);
    expect(OPT_OUT_LINES.length).toBeGreaterThanOrEqual(8);
    expect(new Set(WHY_LINES).size).toBe(WHY_LINES.length);
    expect(new Set(OPT_OUT_LINES.map((l) => l.text)).size).toBe(OPT_OUT_LINES.length);
    for (const line of [...WHY_LINES, ...OPT_OUT_LINES.map((l) => l.text)]) {
      expect(line, line).not.toMatch(/[\u2013\u2014]| -{1,2} |https?:|unsubscribe/i);
    }
    for (const line of WHY_LINES) expect(line).toContain('{domain}');
  });

  it('asks only for replies that classify.ts reads as an opt-out', () => {
    for (const l of OPT_OUT_LINES) {
      expect(classifyMail(reply(`${l.reply}\n\nOn Tue, 20 Oct 2026 at 10:00, Mo <me@sender.io> wrote:\n> ${l.text}`)), l.text).toEqual({ kind: 'human', optOut: true });
    }
  });

  it('picks the same lines for a lead every time and varies them across leads', () => {
    const o = { signature: '', displayName: 'Mo Pradsgaard', siteDomain: 'nvoke.run', domain: 'acme.com' };
    expect(footer({ ...o, leadKey: 'lead-1' })).toBe(footer({ ...o, leadKey: 'lead-1' }));
    const many = new Set(Array.from({ length: 40 }, (_, i) => footer({ ...o, leadKey: `lead-${i}` })));
    expect(many.size).toBeGreaterThan(15);
    const one = footer({ ...o, leadKey: 'lead-7' });
    expect(one.startsWith('Mo\nnvoke.run\n\n')).toBe(true);
    expect(one).toContain('acme.com');
    expect(one).not.toContain('{domain}');
  });

  it('signs with the mailbox signature, else the first name and the site domain', () => {
    expect(signatureFor({ signature: 'Mia\nAcme ApS', displayName: 'Mia Jensen', siteDomain: 'acme.dk' })).toBe('Mia\nAcme ApS');
    expect(signatureFor({ signature: '  ', displayName: 'Mia Jensen', siteDomain: 'Acme.dk' })).toBe('Mia\nacme.dk');
    expect(signatureFor({ signature: '', displayName: 'Mia', siteDomain: null })).toBe('Mia');
  });

  it('puts the footer under the body', () => {
    const o = { signature: 'Mo\nnvoke', displayName: 'Mo', domain: 'acme.com', leadKey: 'x', unsubscribeUrl: 'https://x/u/t' };
    expect(withFooter('Hi.\n\n', o)).toBe(`Hi.\n\n${footer(o)}`);
    expect(footer(o)).toMatch(/^Mo\nnvoke\n\n.+acme\.com.+\S$/s);
  });

  it("replaces both lines with the campaign's own text, keeping the signature", () => {
    const o = { signature: 'Mo\nnvoke', displayName: 'Mo', domain: 'acme.se', leadKey: 'x' };
    const own = '  Din adress fanns på {domain}. Svara nej så slutar jag.  ';
    expect(footer({ ...o, text: own })).toBe('Mo\nnvoke\n\nDin adress fanns på acme.se. Svara nej så slutar jag.');
    expect(withFooter('Hi.', { ...o, text: own })).toBe('Hi.\n\nMo\nnvoke\n\nDin adress fanns på acme.se. Svara nej så slutar jag.');
    expect(footer({ ...o, text: '  ' })).toBe(footer(o));
    expect(footer({ ...o, text: null })).toBe(footer(o));
  });
});

/** A first email and a short follow up in each language, the way the campaigns write them. */
const EMAILS: Record<FooterLanguage, string[]> = {
  en: [
    "Hi Anna,\n\nYour post about the new office in Göteborg says you are hiring two sales reps this spring. When a team grows like that, the first thing to fill is the pipeline. nvoke finds companies like yours in any city and checks every address with the mail server, so nothing bounces. The first 50 verified emails a month are free.\n\nWho books the meetings for your reps today?",
    'Hi Anna,\n\nOne more thought: the Malmö clinic list on your site is the kind of list we build in a few minutes. Is that something you do by hand now?',
  ],
  sv: [
    'Hej Anna,\n\nI ert senaste inlägg skriver ni att ni öppnar ett nytt kontor i Göteborg och söker två säljare. När ett team växer så är det kundlistan som behöver fyllas först. Vi hittar företag som era kunder i vilken stad som helst och kontrollerar varje adress mot mejlservern, så att inget studsar. De första 50 adresserna i månaden är gratis.\n\nVem bokar mötena åt era säljare i dag?',
    'Hej Anna,\n\nEn sak till: listan över kliniker i Malmö på er webbplats är just den sortens lista vi bygger på några minuter. Gör ni den för hand nu?',
  ],
  da: [
    'Hej Anna,\n\nI jeres seneste indlæg skriver I, at I åbner et nyt kontor i Aarhus og søger to sælgere. Når et team vokser sådan, er det kundelisten, der skal fyldes først. Vi finder virksomheder som jeres kunder i enhver by og tjekker hver adresse mod mailserveren, så intet bliver afvist. De første 50 adresser om måneden er gratis.\n\nHvem booker møderne for jeres sælgere i dag?',
    'Hej Anna,\n\nEn ting mere: listen over klinikker i Odense på jeres hjemmeside er netop den slags liste, vi bygger på et par minutter. Laver I den i hånden nu?',
  ],
  no: [
    'Hei Anna,\n\nI det siste innlegget deres skriver dere at dere åpner et nytt kontor i Bergen og ser etter to selgere. Når et team vokser slik, er det kundelisten som må fylles først. Vi finner bedrifter som kundene deres i hvilken som helst by og sjekker hver adresse mot e-postserveren, så ingenting blir avvist. De første 50 adressene i måneden er gratis.\n\nHvem booker møtene for selgerne deres nå?',
    'Hei Anna,\n\nEn ting til: listen over klinikker i Stavanger på nettstedet deres er akkurat den typen liste vi lager på noen minutter. Lager dere den for hånd nå?',
  ],
  de: [
    'Hallo Frau Berg,\n\nin Ihrem letzten Beitrag schreiben Sie, dass Sie ein neues Büro in Hamburg eröffnen und zwei Vertriebler suchen. Wenn ein Team so wächst, muss zuerst die Liste der Kunden gefüllt werden. Wir finden Firmen wie Ihre Kunden in jeder Stadt und prüfen jede Adresse beim Mailserver, damit nichts zurückkommt. Die ersten 50 Adressen im Monat sind kostenlos.\n\nWer bucht heute die Termine für Ihren Vertrieb?',
    'Hallo Frau Berg,\n\nnoch ein Gedanke: die Liste der Praxen in München auf Ihrer Seite ist genau die Art Liste, die wir in wenigen Minuten bauen. Machen Sie die noch von Hand?',
  ],
  fi: [
    'Hei Anna,\n\nViimeisimmässä kirjoituksessanne kerrotte, että avaatte uuden toimiston Tampereelle ja haette kahta myyjää. Kun tiimi kasvaa näin, ensimmäisenä on täytettävä asiakaslista. Löydämme asiakkaidenne kaltaisia yrityksiä mistä tahansa kaupungista ja tarkistamme jokaisen osoitteen postipalvelimelta, jotta mikään ei palaudu. Ensimmäiset 50 osoitetta kuukaudessa ovat ilmaisia.\n\nKuka varaa tapaamiset myyjillenne nyt?',
    'Hei Anna,\n\nVielä yksi asia: sivustonne lista Oulun klinikoista on juuri sellainen lista, jonka teemme muutamassa minuutissa. Teettekö sen nyt käsin?',
  ],
};

/** Long dashes, a dash as punctuation, a link or the word unsubscribe. */
const BANNED = new RegExp('[\\u2013\\u2014]| -{1,2} |https?:|unsubscribe', 'i');

describe('footer languages', () => {
  it('has at least 6 plain variants of each line in every language', () => {
    for (const lang of FOOTER_LANGUAGES) {
      const { why, optOut } = FOOTER_LINES[lang];
      expect(why.length, lang).toBeGreaterThanOrEqual(6);
      expect(optOut.length, lang).toBeGreaterThanOrEqual(6);
      expect(new Set(why).size, lang).toBe(why.length);
      expect(new Set(optOut.map((l) => l.text)).size, lang).toBe(optOut.length);
      for (const line of [...why, ...optOut.map((l) => l.text)]) expect(line, line).not.toMatch(BANNED);
      for (const line of why) expect(line, line).toContain('{domain}');
    }
  });

  it('asks in every language only for replies that classify.ts reads as an opt-out', () => {
    for (const lang of FOOTER_LANGUAGES) {
      for (const l of FOOTER_LINES[lang].optOut) {
        expect(classifyMail(reply(`${l.reply}\n\nOn Tue, 20 Oct 2026 at 10:00, Mo <me@sender.io> wrote:\n> ${l.text}`)), `${lang}: ${l.text}`).toEqual({ kind: 'human', optOut: true });
      }
    }
  });

  it('does not read a quoted footer under an ordinary reply as an opt-out', () => {
    const intros: Record<FooterLanguage, string> = {
      en: 'On Tue, 20 Oct 2026 at 10:00, Mo <me@sender.io> wrote:',
      sv: 'Den tis 20 okt. 2026 kl. 10:00 skrev Mo <me@sender.io>:',
      da: 'Den tir. 20. okt. 2026 kl. 10.00 skrev Mo <me@sender.io>:',
      no: 'tir. 20. okt. 2026 kl. 10:00 skrev Mo <me@sender.io>:',
      de: 'Am Di., 20. Okt. 2026 um 10:00 Uhr schrieb Mo <me@sender.io>:',
      fi: 'ti 20.10.2026 klo 10.00 Mo <me@sender.io> kirjoitti:',
    };
    for (const lang of FOOTER_LANGUAGES) {
      for (const l of FOOTER_LINES[lang].optOut) {
        const quoted = `Sounds good, send me the prices.\n\n${intros[lang]}\n\n${EMAILS[lang][0]}\n\nMo\n\n${l.text}`;
        expect(classifyMail(reply(quoted)), `${lang}: ${l.text}`).toEqual({ kind: 'human', optOut: false });
      }
    }
    const outlook = `Kiitos, kuulostaa hyvältä.\n\nLähettäjä: Mo <me@sender.io>\nLähetetty: tiistai 20. lokakuuta 2026 10.00\n\n${FOOTER_LINES.fi.optOut[3]!.text}`;
    expect(classifyMail(reply(outlook))).toEqual({ kind: 'human', optOut: false });
  });

  it('reads the language of first emails and follow ups', () => {
    for (const lang of FOOTER_LANGUAGES) {
      for (const body of EMAILS[lang]) expect(detectLanguage(body), `${lang}: ${body.slice(0, 40)}`).toBe(lang);
    }
    expect(detectLanguage('')).toBe('en');
    expect(detectLanguage('Hi Anna, Göteborg?')).toBe('en');
  });

  it('writes the footer in the language of the body', () => {
    const o = { signature: 'Mo', displayName: 'Mo', domain: 'acme.se', leadKey: 'lead-3' };
    for (const lang of FOOTER_LANGUAGES) {
      const text = withFooter(EMAILS[lang][0]!, o);
      const tail = text.slice(text.lastIndexOf('\n\n') + 2);
      const { why, optOut } = FOOTER_LINES[lang];
      expect(why.some((w) => tail.startsWith(w.replaceAll('{domain}', 'acme.se'))), `${lang}: ${tail}`).toBe(true);
      expect(optOut.some((l) => tail.endsWith(l.text)), `${lang}: ${tail}`).toBe(true);
    }
    expect(withFooter(EMAILS.sv[0]!, { ...o, language: 'de' })).toBe(`${EMAILS.sv[0]}\n\n${footer({ ...o, language: 'de' })}`);
  });
});
