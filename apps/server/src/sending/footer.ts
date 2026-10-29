// The footer under every step (docs/sending/plan.md, "Legal and copy" and
// "Writing"): who sent it, how to stop and where the address came from.
// Claude never writes these lines, so they cannot drift.
//
// Shape: the signature, a blank line, then two lines. First a warm, first
// person opt-out ("If I'm off base, tell me and I'll stop writing."), the way
// a person writes it by hand. Then the source, as short as it goes ("I found
// your address on acme.com.").
//
// Why the source line stays: Art 14(3)(b) wants the Art 14 information at
// the latest at the first communication with the person, and where the data
// came from is part of it (Art 14(2)(f)). Art 21(4) wants the right to object
// brought to the person's attention by then too, which the opt-out line does.
// The rest of the Art 14 list lives in the privacy notice
// (docs/legal/article-14.md), so the email itself carries who (the
// signature), how to stop and where from. The source goes last so the email
// still reads as a person writing, not as a notice.
//
// Each line is picked from hand-written variants by the lead, so one thread
// always says the same and a batch does not repeat one sentence under every
// email. They are written in the language of the email they sit under
// (detectLanguage reads the body), so a Swedish email gets a Swedish footer.
// Every opt-out variant carries the reply a person would send to it, which
// classify.ts must read as an opt-out (footer.test.ts checks): "no", "stop",
// "not interested", "not relevant", "remove me" and their translations. A
// campaign may set its own footer text, which replaces both lines. Plain
// text, no links in the body; the one click unsubscribe lives in the
// List-Unsubscribe header.

export const FOOTER_LANGUAGES = ['en', 'sv', 'da', 'no', 'de', 'fi'] as const;
export type FooterLanguage = (typeof FOOTER_LANGUAGES)[number];

export interface FooterOptions {
  /** The mailbox's own signature. Used as it is when set. */
  signature: string;
  displayName: string;
  /** The sender's site domain from the site profile, under the first name when there is no signature. */
  siteDomain?: string | null;
  /** The recipient's company domain, where the address was found. */
  domain: string;
  /** Picks the variants: the campaign lead's id, so every step of a thread says the same. */
  leadKey?: string;
  /** The language of the lines. footer() writes English when left out; withFooter() reads it from the body. */
  language?: FooterLanguage;
  /** The campaign's own footer text, in place of the opt-out and source lines. `{domain}` is the recipient's domain. */
  text?: string | null;
  /** False leaves the signature out (a template signs itself); the footer lines stay. */
  signed?: boolean;
  /** Kept for a later plain text link; not printed in the body today. */
  unsubscribeUrl?: string;
}

export interface FooterLines {
  /** The source line, last and short. `{domain}` is the recipient's company domain. */
  why: readonly string[];
  /** The opt-out line, first, with the reply a person would send to it, which classify.ts reads as an opt-out. */
  optOut: ReadonlyArray<{ text: string; reply: string }>;
}

export const FOOTER_LINES: Record<FooterLanguage, FooterLines> = {
  en: {
    why: [
      'I found your address on {domain}.',
      'Your address is from {domain}.',
      "I found your email on {domain}'s website.",
      'Your address came from {domain}.',
    ],
    optOut: [
      { text: "If I'm off base, tell me and I'll stop writing.", reply: 'Not relevant, thanks.' },
      { text: "Happy to bow out if this isn't relevant to you. Just say.", reply: 'Not for us, thanks.' },
      { text: "A simple no and I won't trouble you again.", reply: 'No' },
      { text: "If the timing is wrong, or I am, say so and I'll leave you be.", reply: 'No thanks' },
      { text: "If this isn't for you, a one word no is plenty and I'll stop here.", reply: 'No.' },
      { text: "Not your thing? Say so and I won't write again.", reply: 'not interested' },
      { text: "If I've got the wrong person, tell me and I'll stop writing.", reply: 'Wrong person, please remove me' },
      { text: "Just say stop and this is the last you'll hear from me.", reply: 'Stop' },
    ],
  },
  sv: {
    why: ['Jag hittade din adress på {domain}.', 'Din adress kommer från {domain}.', 'Adressen hittade jag på {domain}.'],
    optOut: [
      { text: 'Om jag är helt fel ute, säg till så slutar jag skriva.', reply: 'Inte relevant, tack.' },
      { text: 'Ett enkelt nej räcker, så hör jag inte av mig igen.', reply: 'Nej' },
      { text: 'Passar det inte, säg bara till så lämnar jag dig i fred.', reply: 'Nej tack' },
      { text: 'Har jag fått fel person, säg till så slutar jag.', reply: 'Fel person, ta bort mig' },
      { text: 'Är det inte aktuellt, säg bara nej så låter jag bli.', reply: 'inte intresserad' },
      { text: 'Säg stopp så är det här mitt sista mejl.', reply: 'Stopp' },
    ],
  },
  da: {
    why: ['Jeg fandt din adresse på {domain}.', 'Din adresse er fra {domain}.', 'Adressen fandt jeg på {domain}.'],
    optOut: [
      { text: 'Rammer jeg helt ved siden af, så sig til, og jeg stopper med at skrive.', reply: 'Ikke relevant, tak.' },
      { text: 'Et enkelt nej er nok, så hører du ikke fra mig igen.', reply: 'Nej' },
      { text: 'Passer det ikke, så sig bare til, og jeg lader dig være.', reply: 'Nej tak' },
      { text: 'Har jeg fat i den forkerte, så sig til, og jeg stopper.', reply: 'Forkert person, fjern mig' },
      { text: 'Er det ikke aktuelt, så sig bare nej, og jeg trækker mig.', reply: 'ikke interesseret' },
      { text: 'Skriv stop, så er det her min sidste mail.', reply: 'Stop' },
    ],
  },
  no: {
    why: ['Jeg fant adressen din på {domain}.', 'Adressen din er fra {domain}.', 'Adressen fant jeg på {domain}.'],
    optOut: [
      { text: 'Bommer jeg helt, si ifra, så slutter jeg å skrive.', reply: 'Ikke relevant, takk.' },
      { text: 'Et enkelt nei holder, så hører du ikke fra meg igjen.', reply: 'Nei' },
      { text: 'Passer det ikke, si bare ifra, så lar jeg deg være i fred.', reply: 'Nei takk' },
      { text: 'Har jeg truffet feil person, si ifra, så slutter jeg.', reply: 'Feil person, fjern meg' },
      { text: 'Er det ikke aktuelt, si nei, så trekker jeg meg.', reply: 'ikke interessert' },
      { text: 'Skriv stopp, så er dette min siste e-post.', reply: 'Stopp' },
    ],
  },
  de: {
    why: ['Ihre Adresse habe ich auf {domain} gefunden.', 'Ihre Adresse stammt von {domain}.', 'Die Adresse habe ich auf {domain} gefunden.'],
    optOut: [
      { text: 'Falls ich danebenliege, sagen Sie es kurz, dann schreibe ich nicht mehr.', reply: 'Nicht relevant, danke.' },
      { text: 'Ein kurzes Nein genügt, dann hören Sie nichts mehr von mir.', reply: 'Nein' },
      { text: 'Passt es nicht, sagen Sie einfach Bescheid, und ich lasse Sie in Ruhe.', reply: 'Nein danke' },
      { text: 'Bin ich bei Ihnen falsch, sagen Sie es, dann höre ich auf.', reply: 'Falsche Adresse, bitte austragen' },
      { text: 'Ist das gerade kein Thema, reicht ein Nein, und ich ziehe mich zurück.', reply: 'Kein Interesse, danke' },
      { text: 'Ein „Stopp“ genügt, und das war meine letzte E-Mail.', reply: 'Stopp' },
    ],
  },
  fi: {
    why: ['Löysin osoitteesi sivustolta {domain}.', 'Osoitteesi on sivustolta {domain}.', 'Osoitteesi löytyi sivustolta {domain}.'],
    optOut: [
      { text: 'Jos olen väärillä jäljillä, sano vain, niin lopetan kirjoittamisen.', reply: 'Ei ajankohtainen, kiitos.' },
      { text: 'Pelkkä ei riittää, enkä kirjoita sinulle enää.', reply: 'Ei' },
      { text: 'Jos tämä ei sovi, sano vain, niin jätän sinut rauhaan.', reply: 'Ei kiitos' },
      { text: 'Jos tavoitin väärän henkilön, kerro, niin lopetan.', reply: 'Väärä henkilö, poista minut' },
      { text: 'Jos aihe ei ole ajankohtainen, vastaa ei kiinnosta, niin vetäydyn.', reply: 'ei kiinnosta' },
      { text: 'Vastaa lopeta, niin tämä jää viimeiseksi viestikseni.', reply: 'lopeta' },
    ],
  },
};

/** The English lines, as before the other languages came. */
export const WHY_LINES = FOOTER_LINES.en.why;
export const OPT_OUT_LINES = FOOTER_LINES.en.optOut;

/**
 * Common words of each language. Danish and Norwegian share most of theirs,
 * so each also has the words that tell them apart (af/av, hvad/hva, mig/meg,
 * nu/nå, jer/dere); Swedish has its own (och, inte, är, vad, från).
 */
const WORDS: Record<FooterLanguage, ReadonlySet<string>> = {
  en: new Set('the and you your is are to of for with we our this that it on how what who do does have not would will can be at from about'.split(' ')),
  sv: new Set('och att är inte jag det som för med på ni er ert era din ditt vad hur också har kan till av om en ett vi oss vår mig dig nu här så men eller sig från när vill skulle någon något hej'.split(' ')),
  da: new Set('og at er ikke jeg det som for med på jer jeres din dit hvad hvordan også har kan til af om en et vi os vores mig dig nu her så men eller sig fra når vil ville nogen noget hej'.split(' ')),
  no: new Set('og at er ikke jeg det som for med på dere deres din ditt hva hvordan også har kan til av om en et vi oss vår meg deg nå her så men eller seg fra når vil ville noen noe hei'.split(' ')),
  de: new Set('und nicht ich sie ist wir für mit auf das die der den dem zu ihr ihre ihren ihnen wie auch haben sind ein eine einen es im oder aber wenn noch hallo uns unser dass'.split(' ')),
  fi: new Set('ja on ei että se kuin myös te teidän teille sinun olen voi miten mitä kanssa tai ovat ole oli jos hei mutta kun nyt tämä joka sekä onko olisi'.split(' ')),
};

/** The language of an email body, by its common words. English when unsure. */
export function detectLanguage(text: string): FooterLanguage {
  const words = text.toLowerCase().match(/\p{L}+/gu) ?? [];
  let best: FooterLanguage = 'en';
  let top = 0;
  for (const lang of FOOTER_LANGUAGES) {
    let n = 0;
    for (const w of words) if (WORDS[lang].has(w)) n++;
    // Ties keep the earlier language, so English wins one.
    if (n > top) {
      best = lang;
      top = n;
    }
  }
  return top >= 2 ? best : 'en';
}

/** A small stable hash (FNV-1a), so a lead always gets the same variant. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // FNV's low bits depend only on the low bits of the input, so with list
  // lengths that are powers of two the two picks would move together. Mix
  // the high bits down (murmur3's finaliser) before taking the remainder.
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

function pick<T>(list: readonly T[], key: string, salt: string): T {
  return list[hash(`${salt}:${key}`) % list.length]!;
}

/** The mailbox's signature when set, else the display name's first name and the sender's site domain. */
export function signatureFor(o: Pick<FooterOptions, 'signature' | 'displayName' | 'siteDomain'>): string {
  const own = o.signature.trim();
  if (own) return own;
  const first = o.displayName.trim().split(/\s+/)[0] ?? '';
  const site = o.siteDomain?.trim().toLowerCase() ?? '';
  return [first || o.displayName.trim(), site].filter(Boolean).join('\n');
}

export function footer(o: FooterOptions): string {
  const sign = (lines: string) => (o.signed === false ? lines : `${signatureFor(o)}\n\n${lines}`);
  const own = o.text?.trim();
  if (own) return sign(own.replaceAll('{domain}', o.domain));
  const key = o.leadKey ?? o.domain;
  const lines = FOOTER_LINES[o.language ?? 'en'];
  const stop = pick(lines.optOut, key, 'stop').text;
  const why = pick(lines.why, key, 'why').replaceAll('{domain}', o.domain);
  // Two lines, not one paragraph: the opt-out is the last thing the sender
  // says, the source a small note under it.
  return sign(`${stop}\n${why}`);
}

/** The body Claude wrote with the footer under it, in the body's language unless one is given. */
export function withFooter(body: string, o: FooterOptions): string {
  return `${body.trimEnd()}\n\n${footer({ ...o, language: o.language ?? detectLanguage(body) })}`;
}
