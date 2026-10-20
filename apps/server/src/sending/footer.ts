// The footer under every step (docs/sending/plan.md, "Legal and copy" and
// "Writing"): who sent it, why the recipient gets it and how to stop.
// Claude never writes these lines, so they cannot drift. The "why you" line
// and the opt-out line are each picked from hand-written variants by the
// lead, so one thread always says the same and a batch does not repeat one
// sentence under every email. Every opt-out variant asks for a reply that
// classify.ts reads as an opt-out: "no", "stop", "not interested",
// "remove me". Plain text, no links in the body; the one click unsubscribe
// lives in the List-Unsubscribe header.

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
  /** Kept for a later plain text link; not printed in the body today. */
  unsubscribeUrl?: string;
}

/** Where the address came from. `{domain}` is the recipient's company domain. */
export const WHY_LINES: readonly string[] = [
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
];

/** How to stop, and the reply each asks for, which classify.ts reads as an opt-out (footer.test.ts checks). */
export const OPT_OUT_LINES: ReadonlyArray<{ text: string; reply: string }> = [
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
];

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
  const key = o.leadKey ?? o.domain;
  const why = pick(WHY_LINES, key, 'why').replaceAll('{domain}', o.domain);
  const stop = pick(OPT_OUT_LINES, key, 'stop').text;
  return `${signatureFor(o)}\n\n${why} ${stop}`;
}

/** The body Claude wrote with the footer under it. */
export function withFooter(body: string, o: FooterOptions): string {
  return `${body.trimEnd()}\n\n${footer(o)}`;
}
