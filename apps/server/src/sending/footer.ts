// The fixed footer under every step (docs/sending/plan.md, "Legal and
// copy"): who sent it, why the recipient gets it and how to stop. Claude
// never writes these lines, so they cannot drift. Plain text, no links in
// the body; the one click unsubscribe lives in the List-Unsubscribe header.

export interface FooterOptions {
  signature: string;
  displayName: string;
  /** The recipient's company domain, where the address was found. */
  domain: string;
  /** Kept for a later plain text link; not printed in the body today. */
  unsubscribeUrl?: string;
}

export function footer(o: FooterOptions): string {
  const signature = o.signature.trim() || o.displayName.trim();
  const why = `I found your address on ${o.domain}'s website. Reply stop and I will not write again.`;
  return `${signature}\n\n${why}`;
}

/** The body Claude wrote with the footer under it. */
export function withFooter(body: string, o: FooterOptions): string {
  return `${body.trimEnd()}\n\n${footer(o)}`;
}
