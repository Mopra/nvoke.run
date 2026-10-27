// What a mail that arrives in a sending mailbox is (docs/sending/plan.md,
// "classify.ts"): a bounce (a delivery status report or a mailer daemon),
// an auto reply (out of office, vacation responders), or a person writing
// back, who may be asking us to stop. Pure; the poller matches the mail to
// a lead and outcomes.ts acts on the class.

import type { IncomingMail } from './types.js';

export type Classified =
  | { kind: 'bounce'; hard: boolean; recipient: string | null; status: string | null }
  | { kind: 'auto_reply' }
  | { kind: 'human'; optOut: boolean };

/** Senders of delivery reports: `MAILER-DAEMON@`, `postmaster@`, Exchange's own address, "Mail Delivery Subsystem". */
const DAEMON_FROM = /(^|[<\s"])(mailer-daemon|postmaster|mail-daemon|mailerdaemon)@|mail delivery (subsystem|system)|microsoftexchange[0-9a-f]{16,}@/i;

/** How the subject of a bounce report starts, for one from an unusual sender. */
const BOUNCE_SUBJECT = /^(undeliverable:|undelivered mail returned|mail delivery failed|delivery status notification \((failure|delay)\)|returned mail:|failure notice$|unzustellbar:|non remis :|no se puede entregar:|onbestelbaar:|kan ikke leveres:|kunde inte levereras:)/i;

/**
 * How an out of office subject starts, in English, German, Spanish, French,
 * Danish, Dutch and Swedish. Only the start: "Re: Your semester plans" is a
 * person writing back.
 */
const AUTO_SUBJECT = new RegExp(
  '^(' +
    [
      // en
      'automatic reply', 'auto[- ]?reply', 'auto[- ]?response', 'autoresponse', 'out of (the )?office', 'out-of-office', 'ooo\\b', 'auto:', 'away from (the )?office',
      'on vacation', 'on holiday', 'on leave', 'on annual leave', 'vacation reply', 'away until',
      // de
      'automatische antwort', 'abwesenheitsnotiz', 'abwesend', 'abwesenheit', 'nicht im b(ü|ue)ro', 'au(ß|ss)er haus', 'im urlaub', 'urlaub',
      // es
      'respuesta autom(á|a)tica', 'fuera de (la )?oficina', 'ausente', 'de vacaciones',
      // fr
      'r(é|e)ponse automatique', 'absent(e)? du bureau', 'absence', "message d'absence", 'en cong(é|e)', 'absent(e)?\\b',
      // da
      'automatisk svar', 'autosvar', 'frav(æ|ae)r', 'ikke p(å|aa) kontoret', 'p(å|aa) ferie', 'ferie', 'ude af kontoret',
      // nl
      'automatisch antwoord', 'afwezig', 'niet aanwezig', 'buiten kantoor', 'met vakantie', 'vakantie',
      // sv
      'fr(å|a)nvaro', 'fr(å|a)nvarande', 'inte p(å|a) kontoret', 'semester', 'ledig',
    ].join('|') +
    ')',
  'i',
);

/** Words that ask us to stop, anywhere in what the person wrote. */
const OPT_OUT = new RegExp(
  [
    // en
    'unsubscribe', 'opt(-| )?out\\b', 'remove me', 'remove us', 'take me off', 'take us off', 'not interested', 'no interest', 'leave me alone',
    "(do not|don't|dont|never) (contact|email|e-mail|mail|write( to)?|message) (me|us)\\b",
    'stop (emailing|e-mailing|mailing|sending|writing|contacting|spamming|messaging)',
    // de
    'abmelden', 'austragen', 'kein interesse', 'nicht interessiert', 'keine (weiteren )?(e-?mails|nachrichten)', 'nicht mehr (kontaktieren|schreiben|anschreiben)',
    // es
    'dar(me|nos|se)? de baja', 'no me interesa', 'no nos interesa', 'no (estoy|estamos) interesad(o|a|os|as)', 'no (me|nos) (escriba|contacte)',
    // fr
    'd(é|e)sabonner', 'd(é|e)sinscri', 'pas int(é|e)ress(é|e)', 'ne (me|nous) (contactez|(é|e)crivez) plus', 'retirez[- ]moi',
    // da
    'afmeld', 'ikke interesseret', 'fjerne? (mig|os)\\b', 'skriv ikke', 'kontakt mig ikke',
    // nl
    'uitschrijven', 'geen interesse', 'niet ge(ï|i)nteresseerd', 'verwijder (mij|me|ons)',
    // sv
    'avregistrera', 'avsluta prenumeration', 'inte intresserad', 'ta bort mig', 'kontakta mig inte',
    // no
    'meld (meg|oss) av', 'avmeld', 'ikke interessert', 'fjerne? (meg|oss)', 'slett meg', 'ikke kontakt (meg|oss)',
    // fi
    'ei kiinnosta', 'ei kiinnostusta', 'en ole kiinnostunut', 'emme ole kiinnostuneita', 'poista minut', 'poistakaa minut',
  ].join('|'),
  'i',
);

/** A first line that is only "stop" ("Stop.", "STOP", "please stop", "stopp", "lopeta"). */
const STOP_LINE = /^(please\s+)?(stop|stopp|stoppen|lopeta|basta|arr(ê|e)tez)\b[\s.!]*(it|this|please|now|thanks?|thank you)?[\s.!]*$/i;

/**
 * A first line that says no and nothing else ("No.", "no thanks", "Nope",
 * "No thank you, we are fine"): the footers invite a one word no. "No
 * problem" and "No, tell me more" are not a no to the email. The same in
 * the footer's other languages: "Nej tack", "Nein danke", "Nei takk", "Ei kiitos".
 */
const NO_LINE = /^(no|nope|nah|nej|nein|nei|ei)\b[\s.!]*$|^(no|nope)[\s,.!]+(thanks?|thank you)\b|^(nej|nein|nei|ei)[\s,.!]+(tack|tak|takk|danke|kiitos)\b(?![\s,]+(for|för|für)\b)/i;

/** "Remove" alone, or "please remove": the footer asks for "remove me". */
const REMOVE_LINE = /^(please\s+)?remove(\s+(me|us|this address|my address))?(\s+please)?[\s.!]*$/i;

/** The line a mail client writes above the quote, once its first word is known. */
const QUOTE_INTRO = /(wrote|schrieb|escribi(ó|o)|a (é|e)crit|skrev|schreef|kirjoitti)(?!\p{L})[^:]{0,120}:\s*$/iu;

function header(mail: IncomingMail, name: string): string | null {
  const v = mail.headers[name];
  return v === undefined ? null : v.trim();
}

/** The address in `rfc822; <a@b.c>`, lowercased. */
function address(value: string): string | null {
  const m = /([^\s<>;:"]+@[^\s<>;"]+)/.exec(value);
  return m ? m[1]!.toLowerCase().replace(/[.,>]+$/, '') : null;
}

/** A field of a status report, unfolded: `Final-Recipient`, `Status`. */
function field(report: string, name: string): string | null {
  const m = new RegExp(`^${name}:[ \\t]*(.*(?:\\r?\\n[ \\t]+.*)*)`, 'im').exec(report);
  return m ? m[1]!.replace(/\r?\n[ \t]+/g, ' ').trim() : null;
}

function bounce(mail: IncomingMail): Classified {
  const report = mail.deliveryStatus ?? '';
  // A report has a block per message, then one per recipient: read the one that failed.
  const blocks = report.split(/\r?\n[ \t]*\r?\n/).filter((b) => /^(final|original)-recipient:/im.test(b));
  const failed = blocks.find((b) => /^action:\s*failed/im.test(b)) ?? blocks[0] ?? report;

  let recipient = field(failed, 'Final-Recipient') ?? field(failed, 'Original-Recipient');
  let status = /[245]\.\d{1,3}\.\d{1,3}/.exec(field(failed, 'Status') ?? '')?.[0] ?? null;
  const action = field(failed, 'Action')?.toLowerCase() ?? null;
  const text = mail.text;

  // No report part (Exim, some hosted daemons): read the plain text.
  if (!recipient) recipient = header(mail, 'x-failed-recipients');
  if (!recipient) {
    const listed =
      /(?:following (?:address(?:es|\(es\))?|recipients?)(?: failed)?|could not be delivered to|failed to these recipients(?: or groups)?|wasn't delivered to|couldn't be delivered to)[^\n@]*?\s*<?([^\s<>:]+@[^\s<>:]+)/i.exec(text);
    recipient = listed?.[1] ?? null;
  }
  if (!status) status = /\b([245]\.\d{1,3}\.\d{1,3})\b/.exec(text)?.[1] ?? null;
  if (!status) {
    // A bare SMTP reply: "550 User unknown".
    const smtp = /(?:^|\s)([45])\d\d[ -][A-Za-z]/m.exec(text)?.[1];
    if (smtp) status = `${smtp}.0.0`;
  }

  let hard: boolean;
  if (action && action !== 'failed') hard = false;
  else if (status) hard = status.startsWith('5') && !isPolicyBlock(status);
  else hard = /permanent(ly)? (error|failure)|this is a permanent error|does not exist|no such user|user unknown/i.test(text);

  return { kind: 'bounce', hard, recipient: recipient ? address(recipient) : null, status };
}

function isBounce(mail: IncomingMail): boolean {
  if (mail.deliveryStatus) return true;
  const type = header(mail, 'content-type') ?? '';
  if (/multipart\/report/i.test(type) && /report-type\s*=\s*"?delivery-status/i.test(type)) return true;
  if (header(mail, 'x-failed-recipients')) return true;
  return DAEMON_FROM.test(mail.from) || BOUNCE_SUBJECT.test(mail.subject.trim());
}

function isAutoReply(mail: IncomingMail): boolean {
  const submitted = header(mail, 'auto-submitted');
  if (submitted && submitted.toLowerCase() !== 'no') return true;
  if (header(mail, 'x-autoreply') !== null || header(mail, 'x-autorespond') !== null || header(mail, 'x-autoresponder') !== null) return true;
  if (header(mail, 'x-autogenerated')?.toLowerCase() === 'reply') return true;
  if (/auto[_-]?reply/i.test(header(mail, 'precedence') ?? '')) return true;
  return AUTO_SUBJECT.test(mail.subject.trim());
}

/**
 * What the person wrote above the quote: lines starting with `>` go, and so
 * does everything from the first reply separator ("On ... wrote:", "Am ...
 * schrieb", "-----Original Message-----", an Outlook "From:" block).
 */
export function ownText(text: string): string {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const kept: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i]!.trim();
    const next = (lines[i + 1] ?? '').trim();
    if (/^-{2,}\s*(original message|ursprüngliche nachricht|mensaje original|message d'origine|oprindelig meddelelse|oorspronkelijk bericht|ursprungligt meddelande|opprinnelig melding|alkuperäinen viesti)/i.test(t)) break;
    if (/^_{8,}$/.test(t)) break;
    if (/^(from|von|de|fra|van|från|lähettäjä) ?:\s/i.test(t) && /^(sent|gesendet|enviado|envoyé|sendt|verzonden|skickat|lähetetty|date|datum|fecha|dato|päivämäärä) ?:\s/i.test(next)) break;
    // "On Tue, 20 Oct 2026 at 10:00 Anna <a@b.c> wrote:", "Den tir. 20. okt. 2026 kl. 10.00 skrev Anna <a@b.c>:",
    // "tir. 27. okt. 2026 kl. 10:00 skrev ...", "ti 27.10.2026 klo 10.00 Matti <m@x.fi> kirjoitti:",
    // any of which may wrap over two lines. Without a known first word, a date must be on the line.
    const intro = QUOTE_INTRO.test(t) || QUOTE_INTRO.test(`${t} ${next}`);
    if (intro && (/^(on|am|el|le|den|op)\s/i.test(t) || /\d/.test(t))) break;
    if (t.startsWith('>')) continue;
    kept.push(lines[i]!);
  }
  return kept.join('\n').trim();
}

function isOptOut(mail: IncomingMail): boolean {
  const own = ownText(mail.text);
  const subject = mail.subject.trim();
  if (/^(unsubscribe|stop|remove me|opt[- ]?out)\b/i.test(subject)) return true;
  const first = own.split('\n').map((l) => l.trim()).find(Boolean) ?? '';
  if (STOP_LINE.test(first) || NO_LINE.test(first) || REMOVE_LINE.test(first)) return true;
  return OPT_OUT.test(own.replace(/\s+/g, ' '));
}

/**
 * What a mail is. A bounce first (a status report, a mailer daemon or a
 * bounce subject), then an auto reply (Auto-Submitted other than `no`,
 * X-Autoreply, X-Autorespond, Precedence auto_reply, or an out of office
 * subject), else a person, who opts out with words like "unsubscribe",
 * "remove me", "not interested" or a reply of just "stop" or "no".
 */
export function classifyMail(mail: IncomingMail): Classified {
  if (isBounce(mail)) return bounce(mail);
  if (isAutoReply(mail)) return { kind: 'auto_reply' };
  return { kind: 'human', optOut: isOptOut(mail) };
}

/**
 * A 5.7.x refusal is the receiving server blocking the sender (spam,
 * reputation, policy), not a missing mailbox: the address may be fine, so
 * it is never marked invalid.
 */
export function isPolicyBlock(response: string): boolean {
  return /\b5\.7\.\d{1,3}\b/.test(response);
}
