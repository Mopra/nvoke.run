// The footer under every step (docs/sending/plan.md, "Legal and copy" and
// "Writing"): who sent it, why the recipient gets it and how to stop.
// Claude never writes these lines, so they cannot drift. The "why you" line
// and the opt-out line are each picked from hand-written variants by the
// lead, so one thread always says the same and a batch does not repeat one
// sentence under every email. They are written in the language of the email
// they sit under (detectLanguage reads the body), so a Swedish email gets a
// Swedish footer. Every opt-out variant asks for a reply that classify.ts
// reads as an opt-out: "no", "stop", "not interested", "remove me" and
// their translations. A campaign may set its own footer text, which
// replaces both lines. Plain text, no links in the body; the one click
// unsubscribe lives in the List-Unsubscribe header.

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
  /** The campaign's own footer line, in place of the why and opt-out lines. `{domain}` is the recipient's domain. */
  text?: string | null;
  /** Kept for a later plain text link; not printed in the body today. */
  unsubscribeUrl?: string;
}

export interface FooterLines {
  /** Where the address came from. `{domain}` is the recipient's company domain. */
  why: readonly string[];
  /** How to stop, and the reply each asks for, which classify.ts reads as an opt-out (footer.test.ts checks). */
  optOut: ReadonlyArray<{ text: string; reply: string }>;
}

export const FOOTER_LINES: Record<FooterLanguage, FooterLines> = {
  en: {
    why: [
      "I found your address on {domain}'s website.",
      'Your address is the one listed on {domain}.',
      'I got your email from the contact details on {domain}.',
      "Your address came from {domain}'s own site.",
      'I came across your email on {domain}.',
      'I am writing to the address {domain} publishes.',
      "I picked up your address from {domain}'s website.",
      'Your email was on the {domain} website, which is how I found you.',
      'I found this address on {domain}, where it is listed for contact.',
      "You are listed on {domain}'s site, which is where I found your email.",
    ],
    optOut: [
      { text: "If this misses the mark, a quick no is fine and you won't hear from me again.", reply: 'No' },
      { text: 'Not relevant? Reply stop and I will not write again.', reply: 'stop' },
      { text: "If it's not for you, just reply no and that is the end of it.", reply: 'no' },
      { text: 'Happy to leave it here if it is not useful. A one word no will do.', reply: 'No.' },
      { text: "Reply not interested and I won't follow up.", reply: 'not interested' },
      { text: 'If you would rather not hear from me, reply stop and I will take you off my list.', reply: 'Stop' },
      { text: 'No pressure. Reply no and I will not email again.', reply: 'no thanks' },
      { text: "Wrong person or wrong time? Reply remove me and I'll stop.", reply: 'remove me' },
      { text: 'If this is noise, reply stop and you will not get another one.', reply: 'STOP' },
      { text: 'A short no is a fine answer, and I will not write again after it.', reply: 'No' },
    ],
  },
  sv: {
    why: [
      'Jag hittade din adress på {domain}.',
      'Din adress står som kontaktuppgift på {domain}.',
      'Jag fick din e-postadress från kontaktuppgifterna på {domain}.',
      'Din adress kommer från webbplatsen {domain}.',
      'Jag skriver till adressen som {domain} själva anger.',
      'Jag hittade den här adressen på {domain}, där den står som kontaktadress.',
    ],
    optOut: [
      { text: 'Om det inte passar, svara nej så hör jag inte av mig igen.', reply: 'Nej' },
      { text: 'Inte aktuellt? Svara inte intresserad så skriver jag inte igen.', reply: 'inte intresserad' },
      { text: 'Ingen press. Svara nej så mejlar jag inte igen.', reply: 'nej tack' },
      { text: 'Vill du inte att jag hör av mig, svara ta bort mig så stryker jag dig från min lista.', reply: 'ta bort mig' },
      { text: 'Fel person eller fel tid? Svara stopp så slutar jag.', reply: 'stopp' },
      { text: 'Ett kort nej räcker, och sedan skriver jag inte igen.', reply: 'Nej.' },
    ],
  },
  da: {
    why: [
      'Jeg fandt din adresse på {domain}.',
      'Din adresse står som kontakt på {domain}.',
      'Jeg har din e-mail fra kontaktoplysningerne på {domain}.',
      'Din adresse kommer fra hjemmesiden {domain}.',
      'Jeg skriver til den adresse, som {domain} selv oplyser.',
      'Jeg fandt denne adresse på {domain}, hvor den er angivet som kontaktadresse.',
    ],
    optOut: [
      { text: 'Rammer jeg ved siden af, så svar bare nej, og du hører ikke fra mig igen.', reply: 'Nej' },
      { text: 'Ikke relevant? Svar ikke interesseret, så skriver jeg ikke igen.', reply: 'ikke interesseret' },
      { text: 'Intet pres. Svar nej, så skriver jeg ikke igen.', reply: 'nej tak' },
      { text: 'Vil du hellere være fri for flere mails, så svar fjern mig, og jeg sletter dig fra min liste.', reply: 'fjern mig' },
      { text: 'Forkert person eller forkert tidspunkt? Svar stop, så stopper jeg.', reply: 'stop' },
      { text: 'Et kort nej er et fint svar, og så skriver jeg ikke igen.', reply: 'Nej.' },
    ],
  },
  no: {
    why: [
      'Jeg fant adressen din på {domain}.',
      'Adressen din står oppført som kontakt på {domain}.',
      'Jeg har e-posten din fra kontaktinformasjonen på {domain}.',
      'Adressen din kommer fra nettstedet {domain}.',
      'Jeg skriver til adressen som {domain} selv oppgir.',
      'Jeg fant denne adressen på {domain}, der den står oppført som kontaktadresse.',
    ],
    optOut: [
      { text: 'Treffer dette ikke, svar bare nei, så hører du ikke fra meg igjen.', reply: 'Nei' },
      { text: 'Ikke aktuelt? Svar ikke interessert, så skriver jeg ikke igjen.', reply: 'ikke interessert' },
      { text: 'Ikke noe press. Svar nei, så sender jeg ikke flere e-poster.', reply: 'nei takk' },
      { text: 'Vil du helst slippe, svar fjern meg, så tar jeg deg av listen min.', reply: 'fjern meg' },
      { text: 'Feil person eller feil tidspunkt? Svar stopp, så slutter jeg.', reply: 'stopp' },
      { text: 'Et kort nei holder, og da skriver jeg ikke igjen.', reply: 'Nei.' },
    ],
  },
  de: {
    why: [
      'Ihre Adresse habe ich auf {domain} gefunden.',
      'Ihre Adresse ist auf {domain} als Kontakt angegeben.',
      'Ihre E-Mail-Adresse stammt aus den Kontaktangaben auf {domain}.',
      'Ich schreibe an die Adresse, die {domain} selbst veröffentlicht.',
      'Ich bin auf {domain} auf Ihre Adresse gestoßen.',
      'Diese Adresse habe ich auf {domain} gefunden, wo sie für Anfragen angegeben ist.',
    ],
    optOut: [
      { text: 'Falls das nicht passt, genügt ein kurzes „Nein“, und Sie hören nichts mehr von mir.', reply: 'Nein' },
      { text: 'Nicht relevant? Antworten Sie mit „kein Interesse“, dann schreibe ich nicht mehr.', reply: 'kein Interesse' },
      { text: 'Kein Druck. Antworten Sie mit „Nein“, dann schreibe ich nicht noch einmal.', reply: 'Nein danke' },
      { text: 'Falls Sie nichts mehr von mir lesen möchten, antworten Sie mit „abmelden“.', reply: 'abmelden' },
      { text: 'Falsche Person oder falscher Zeitpunkt? Antworten Sie mit „Stopp“, dann höre ich auf.', reply: 'Stopp' },
      { text: 'Ein kurzes „Nein“ reicht, danach schreibe ich nicht mehr.', reply: 'Nein.' },
    ],
  },
  fi: {
    why: [
      'Löysin osoitteesi sivustolta {domain}.',
      'Osoitteesi on ilmoitettu yhteystiedoksi sivustolla {domain}.',
      'Sain sähköpostiosoitteesi sivuston {domain} yhteystiedoista.',
      'Kirjoitan osoitteeseen, jonka {domain} itse julkaisee.',
      'Osoitteesi löytyi sivustolta {domain}.',
      'Löysin tämän osoitteen sivustolta {domain}, jossa se on yhteydenottoja varten.',
    ],
    optOut: [
      { text: 'Jos tämä ei osu kohdalleen, vastaa vain ei, niin en kirjoita uudelleen.', reply: 'Ei' },
      { text: 'Ei ajankohtaista? Vastaa ei kiinnosta, niin en ota enää yhteyttä.', reply: 'ei kiinnosta' },
      { text: 'Ei paineita. Vastaa ei kiitos, niin en lähetä enää viestejä.', reply: 'Ei kiitos' },
      { text: 'Jos et halua viestejä minulta, vastaa poista minut, niin poistan sinut listaltani.', reply: 'poista minut' },
      { text: 'Väärä henkilö tai väärä hetki? Vastaa lopeta, niin lopetan.', reply: 'lopeta' },
      { text: 'Lyhyt ei riittää, eikä minulta tule sen jälkeen enempää viestejä.', reply: 'Ei.' },
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
  const own = o.text?.trim();
  if (own) return `${signatureFor(o)}\n\n${own.replaceAll('{domain}', o.domain)}`;
  const key = o.leadKey ?? o.domain;
  const lines = FOOTER_LINES[o.language ?? 'en'];
  const why = pick(lines.why, key, 'why').replaceAll('{domain}', o.domain);
  const stop = pick(lines.optOut, key, 'stop').text;
  return `${signatureFor(o)}\n\n${why} ${stop}`;
}

/** The body Claude wrote with the footer under it, in the body's language unless one is given. */
export function withFooter(body: string, o: FooterOptions): string {
  return `${body.trimEnd()}\n\n${footer({ ...o, language: o.language ?? detectLanguage(body) })}`;
}
