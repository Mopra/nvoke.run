// How senior a person is, read from the title a company prints next to their
// name. English, the Nordic languages, German, Dutch, French and Spanish,
// including the compounds German and the Nordic languages build
// ("Vertriebsleiter", "salgsdirektør", "Mitgründerin").

import type { Seniority } from '../leads.ts';

/** Lowercase, German and Nordic letters spelled out, accents dropped. */
export function foldTitle(text: string): string {
  return text
    .toLowerCase()
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'o')
    .replace(/å/g, 'a')
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Founder, owner, CEO, managing director, partner: the person who decides. */
const FOUNDER = [
  /(co-?|med|mit|mede)?(founder|grundlaegger|grunder|grundare|grunnlegger|oprichter|fondateur|fondatrice|fundador|fundadora|stifter|stifterin|grundarin|grunderin)/,
  /\bowner\b(?<!(product|process|data|business process|budget) owner)/,
  /\b(ejer|indehaver|medindehaver|inhaber|inhaberin|mitinhaber|mitinhaberin|eigenaar|eigenares|agare|delagare|innehaver|eier|medeier|proprietaire|propietario|propietaria)\b/,
  /\bceo\b|chief executive|^md$|^md ?(&|and|og|und|\/)|managing director|general manager|managing partner|\bpresident\b(?<!vice president)/,
  /gesch(a|ae)ftsf(u|ue)hr(er|erin|ung)\b|vorstandsvorsitzende|vorsitzende des vorstands/,
  /\b(adm\.?|administrerende|verkstallande|vd)\b ?(direktor)?|\badm\. ?dir\b|daglig leder|toimitusjohtaja/,
  /directeur general|directrice generale|director general|directora general|algemeen directeur|\bgerant(e)?\b|zaakvoerder|bestuurder|directeur-eigenaar/,
  // A partner of the firm, not a badge: "Partner", "Founding Partner", "Partner & CEO", never "Google Premier Partner".
  /\bpartner\b(?! ?(manager|success|marketing|program|relations|development|account|sales|channel|network|programme|status|level|badge|agency))(?<!(channel|account|business|premier|gold|silver|bronze|platinum|certified|official|preferred|solution|solutions|technology|tech|strategic|implementation|reseller|integration|consulting|agency|elite|select|registered|authorized|authorised|accredited|hubspot|google|microsoft|shopify|meta|aws|salesforce) partner)/,
];

/** Other C level and vice presidents. */
const EXECUTIVE = [
  /\bc[tofmrpids]o\b|\bchief\b|\bchair(man|woman|person)?\b|bestyrelsesformand|styreleder|styreordforande|ordforande|aufsichtsratsvorsitz/,
  /\b(s|e)?vp\b|vice president|vicepresident|vice-president|vicedirektor|vice direktor|\bvorstand\b|prokurist/,
];

/** Head of, director, Leiter, chef in Danish and Swedish compounds. */
const DIRECTOR = [
  /\bhead\b|\bhoofd\b|\bjefe\b|\bjefa\b/,
  /director|direktor|directeur|directrice|directora|\bdir\.\b/,
  /leiter(in)?\b|leitung\b|bereichsleit/,
  /[a-z]{3,}chef\b|\bchef (for|de|du|des)\b/,
];

/** Managers and leads. */
const MANAGER = [/manager|\bmgr\b|managerin|\blead\b|leder\b|ledare\b|\bgerente\b|\bresponsable\b|\bansvarlig\b|\bteamlead|\bverantwortlich/];

/**
 * Roles below management. Not a seniority of their own (anything that is
 * not one of the above is staff), but they tell a title from other text.
 */
const STAFF = [
  /consultant|konsulent|berater|adviseur|advis(e|o)r|radgiver|radgivare|radgivar|conseill|asesor/,
  /designer|developer|udvikler|entwickler|ontwikkelaar|developpeu|desarrollador|utvecklare|utvikler|programm|engineer|ingenior|ingenieur|ingeniero/,
  /specialist|spezialist|especialista|analy(st|ste|tiker)|analist|assist(ant|ent|ente)|coordinat|koordinator|coordinador/,
  /accountant|bogholder|buchhalt|revisor|controller|strateg|copywriter|tekstforfatter|texter|\bwriter\b|editor|redakt|redacteu|producer|producent|produzent|realisateur/,
  /architect|arkitekt|architekt|arquitect|representative|saelger|verkauf|vendedor|saljare|selger|medewerker|mitarbeiter|medarbejder|employee|\bintern\b|praktikant|trainee|apprentice|laerling|auszubild/,
  /reception|sekretaer|sekretar|secretar|bookkeeper|recruit|scientist|research|forsker|forscher|chercheu|investigador|techni|tekniker|\bofficer\b|ambassador|associate/,
  /jurist|advokat|rechtsanw|lawyer|attorney|solicitor|barrister|avocat|abogad|advocaat|notar|laege|\barzt|aerztin|arztin|doctor|dentist|tandlaege|zahnarzt|tandlakare|tannlege|tandarts|odontolog|hygienist|tandplejer|klinikassistent/,
  /therap|terapeut|fysioterapeut|physio|psykolog|psycholog|nurse|sygeplejer|coach|trainer|traener|teacher|laerer|lehrer|fotograf|photograph|illustrat|animator|marketer|\bartist\b/,
  /^(marketing|sales|salg|vertrieb|finance|okonomi|hr|support|kundeservice|customer success|operations|drift|administration|it|design|development|udvikling|growth|communications|kommunikation|bd|business development)$/,
];

const RANKED: Array<[Seniority, RegExp[]]> = [
  ['founder', FOUNDER],
  ['executive', EXECUTIVE],
  ['director', DIRECTOR],
  ['manager', MANAGER],
];

/**
 * The seniority a title says, the highest it names: "Founder & CTO" is a
 * founder, "Director of Partnerships" a director. Any other title is staff;
 * no title at all is null.
 */
export function seniorityOf(title: string | null | undefined): Seniority | null {
  if (!title) return null;
  const t = foldTitle(title);
  if (!t) return null;
  for (const [seniority, patterns] of RANKED) if (patterns.some((re) => re.test(t))) return seniority;
  return 'staff';
}

/** Whether the text holds a word of the title lexicon, at any seniority. */
export function hasTitleWord(text: string): boolean {
  const t = foldTitle(text);
  if (!t) return false;
  return RANKED.some(([, patterns]) => patterns.some((re) => re.test(t))) || STAFF.some((re) => re.test(t));
}

/** Words of a sentence, not of a title: "Jane is our CEO", "Wir sind ein Team". */
const SENTENCE_WORD = /\b(is|are|was|were|our|we|i|my|you|your|has|have|will|er|var|vores|vi|ist|sind|wir|unser|ich|est|sommes|nous|notre|zijn|wij|ons|onze|ar|vara|var|vart|es|somos|nuestro|har|hat)\b/;

/**
 * Whether a short piece of text reads as a job title: a few words, with a
 * word of the lexicon, and no sentence around it.
 */
export function looksLikeTitle(text: string): boolean {
  const t = text.trim();
  if (t.length < 2 || t.length > 90) return false;
  if (/[?!@]|https?:|www\.|\d{3,}/.test(t)) return false;
  if (t.split(/\s+/).length > 9) return false;
  if (SENTENCE_WORD.test(foldTitle(t))) return false;
  return hasTitleWord(t);
}
