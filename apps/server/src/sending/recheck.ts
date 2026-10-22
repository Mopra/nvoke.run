// The live check before a send (CampaignProduct.recheck, docs/sending/plan.md,
// "Own products"). An exit1 lead is written because its site's certificate
// is broken; the email must not go out once the owner has fixed it. Just
// before each step the sender shakes hands with the lead's domain and its
// www host again: a certificate that is expired, runs out soon (within
// EXPIRING_DAYS, or a third of its lifetime for a short lived one), is
// self-signed or, on the apex, names another host is still the problem the
// email is about. A www host whose certificate leaves it out is common on
// healthy sites, so that alone is not one. Hosts that answer with none of
// these mean it was renewed, and the lead stops with skip_reason
// 'resolved'. When neither host answers the sender tries again later
// (sender.ts), and stops with 'unreachable' only once that has lasted.

import { connect, checkServerIdentity, type PeerCertificate } from 'node:tls';
import { resolvePublic, type Resolve } from '../webhooks/address.js';

/** A certificate running out this soon has not been renewed yet (Let's Encrypt renews 30 days ahead). */
export const EXPIRING_DAYS = 30;
const TIMEOUT_MS = 10_000;
const DAY_MS = 86_400_000;

export type RecheckResult = 'problem' | 'resolved' | 'unreachable';

/** What one handshake saw. Null: the host did not answer. */
export interface CertSeen {
  validFrom: Date;
  validTo: Date;
  /** The certificate does not name the host. */
  nameMismatch: boolean;
  selfSigned: boolean;
}

export type Handshake = (host: string) => Promise<CertSeen | null>;

/**
 * Whether one host's certificate still has the problem an exit1 email
 * names. `www`: a certificate that does not name the www host is not one.
 */
export function certProblem(seen: CertSeen, now: Date, www = false): boolean {
  const lifetime = seen.validTo.getTime() - seen.validFrom.getTime();
  const soon = Math.min(EXPIRING_DAYS * DAY_MS, lifetime / 3);
  return (seen.nameMismatch && !www) || seen.selfSigned || seen.validTo.getTime() - now.getTime() < soon;
}

/** The apex and www hosts of a lead's domain. */
export function hostsFor(domain: string): string[] {
  const apex = domain.trim().toLowerCase().replace(/^www\./, '');
  return [apex, `www.${apex}`];
}

/** Checks a lead's domain live. Never throws. */
export async function recheckSsl(domain: string, now: Date = new Date(), handshake: Handshake = tlsHandshake): Promise<RecheckResult> {
  const [apex, www] = await Promise.all(hostsFor(domain).map((h) => handshake(h).catch(() => null)));
  if (!apex && !www) return 'unreachable';
  return (apex && certProblem(apex, now)) || (www && certProblem(www, now, true)) ? 'problem' : 'resolved';
}

/**
 * One TLS handshake on port 443 with the host as servername, the
 * certificate read without trusting it. Only public addresses: the host
 * comes from an imported list.
 */
export function tlsHandshake(host: string, resolve?: Resolve): Promise<CertSeen | null> {
  return resolvePublic(host, { allowPrivate: false }, resolve).then(
    (addresses) =>
      new Promise<CertSeen | null>((done) => {
        let finished = false;
        const finish = (v: CertSeen | null) => {
          if (finished) return;
          finished = true;
          clearTimeout(timer);
          socket.destroy();
          done(v);
        };
        const socket = connect({ host: addresses[0]!.address, port: 443, servername: host, rejectUnauthorized: false, timeout: TIMEOUT_MS }, () => {
          const cert: PeerCertificate = socket.getPeerCertificate();
          if (!cert?.valid_to) return finish(null);
          const issuer = JSON.stringify(cert.issuer ?? {});
          // A string code on some Node versions, an Error with a code on others.
          const why: unknown = socket.authorizationError;
          const code = typeof why === 'string' ? why : ((why as { code?: string } | null)?.code ?? '');
          finish({
            validFrom: new Date(cert.valid_from),
            validTo: new Date(cert.valid_to),
            nameMismatch: checkServerIdentity(host, cert) !== undefined,
            selfSigned: /SELF_SIGNED/.test(code) || issuer === JSON.stringify(cert.subject ?? {}),
          });
        });
        const timer = setTimeout(() => finish(null), TIMEOUT_MS + 2_000);
        socket.on('timeout', () => finish(null));
        socket.on('error', () => finish(null));
      }),
    () => null,
  );
}
