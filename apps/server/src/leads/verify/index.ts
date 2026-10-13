// Email verification: syntax, disposable domain list, MX records, then an
// SMTP RCPT probe (no message is ever sent) with catch-all detection.
//
// Politeness: one SMTP connection per MX host at a time, a catch-all verdict
// is remembered per domain so the same server is not asked again, and results
// are cached per address (30 days, 1 day for "unknown") by the caller's cache.
// When port 25 turns out to be unreachable the verifier stops trying for an
// hour and answers "unknown" from MX data alone.

import { randomBytes } from 'node:crypto';
import { isDisposableEmailDomain } from 'disposable-email-domains-js';
import type { Verification } from '@nvoke/shared';
import { normalizeEmail, domainOf } from '../extract.js';
import { KeyedMutex } from '../limits.js';
import { lookupMx, systemDns, type DnsLike, type MxLookup } from './mx.js';
import { smtpProbe, SmtpProbeError, type SmtpProbeOptions, type SmtpReply } from './smtp.js';

export interface VerifyResult {
  address: string;
  verification: Verification;
  mxHost: string | null;
  /** Short machine readable reason, for logs and the email_checks row. */
  reason: string;
}

export interface VerifyCache {
  get(address: string): Promise<VerifyResult | null>;
  set(result: VerifyResult): Promise<void>;
}

export interface VerifierOptions {
  heloName: string;
  mailFrom: string;
  smtpEnabled: boolean;
  dns?: DnsLike;
  cache?: VerifyCache;
  port?: number;
  connectTimeoutMs?: number;
  commandTimeoutMs?: number;
  /** Injectable for tests, see SmtpProbeOptions.connect. */
  connect?: SmtpProbeOptions['connect'];
  now?: () => number;
}

export const CACHE_TTL_MS = 30 * 24 * 60 * 60_000;
export const UNKNOWN_TTL_MS = 24 * 60 * 60_000;

const DOMAIN_TTL_MS = 60 * 60_000;
const PORT25_BLOCK_MS = 60 * 60_000;
/** Connection failures on this many distinct MX hosts, with no success in between, means port 25 is blocked. */
const PORT25_FAILURE_HOSTS = 5;

/** Disposable when the domain or any parent domain is on the list. */
export function isDisposableDomain(domain: string): boolean {
  const labels = domain.toLowerCase().split('.');
  for (let i = 0; i < labels.length - 1; i++) {
    if (isDisposableEmailDomain(labels.slice(i).join('.'))) return true;
  }
  return false;
}

const POLICY_HINT =
  /\b(5\.7\.\d+|block(ed|list)?|black ?list|spamhaus|spamcop|barracuda|rbl|dnsbl|policy|reputation|not (allowed|permitted)|access denied|denied|banned|refused|rejected due|abuse|blocked using|client host|helo|ptr|reverse dns|rdns)\b/i;
const NO_USER_HINT =
  /\b(5\.1\.[0-9]+|user unknown|unknown user|no such (user|mailbox|recipient)|does not exist|doesn't exist|not exist|invalid (recipient|mailbox|address)|recipient (address )?rejected|mailbox (unavailable|not found)|address rejected|unrouteable|undeliverable|not found)\b/i;

/** Classifies the RCPT reply for the real address. */
export function classifyRcpt(reply: SmtpReply): { verification: Verification; reason: string } {
  if (reply.code >= 200 && reply.code < 300) return { verification: 'valid', reason: 'rcpt_accepted' };
  if (reply.code >= 400 && reply.code < 500) return { verification: 'unknown', reason: `rcpt_tempfail_${reply.code}` };
  if (reply.code === 552 || reply.enhanced === '5.2.2') return { verification: 'risky', reason: 'mailbox_full' };
  const text = `${reply.enhanced ?? ''} ${reply.message}`;
  const enhancedUser = reply.enhanced?.startsWith('5.1.') ?? false;
  if (enhancedUser || (NO_USER_HINT.test(text) && !/5\.7\./.test(text))) {
    return { verification: 'invalid', reason: `rcpt_rejected_${reply.code}` };
  }
  if (reply.code === 553 && !/5\.7\./.test(text)) return { verification: 'invalid', reason: 'rcpt_rejected_553' };
  if (POLICY_HINT.test(text)) return { verification: 'unknown', reason: `smtp_policy_${reply.code}` };
  if (reply.code === 550 || reply.code === 551 || reply.code === 553) {
    return { verification: 'invalid', reason: `rcpt_rejected_${reply.code}` };
  }
  return { verification: 'unknown', reason: `rcpt_${reply.code}` };
}

function randomLocal(): string {
  return `nvoke-${randomBytes(6).toString('hex')}-nx`;
}

export class Verifier {
  private readonly dns: DnsLike;
  private readonly mxLocks = new KeyedMutex();
  private readonly mxCache = new Map<string, { at: number; value: Promise<MxLookup> }>();
  private readonly catchAll = new Map<string, number>();
  private readonly connectFailures = new Set<string>();
  private port25BlockedUntil = 0;
  private readonly now: () => number;

  constructor(private readonly opts: VerifierOptions) {
    this.dns = opts.dns ?? systemDns();
    this.now = opts.now ?? Date.now;
  }

  /** True while the verifier believes outbound port 25 is blocked. */
  get smtpBlocked(): boolean {
    return this.now() < this.port25BlockedUntil;
  }

  async verify(rawAddress: string, signal?: AbortSignal): Promise<VerifyResult> {
    const address = normalizeEmail(rawAddress);
    if (!address) return { address: rawAddress.toLowerCase(), verification: 'invalid', mxHost: null, reason: 'syntax' };

    const cached = await this.opts.cache?.get(address);
    if (cached) return cached;

    const result = await this.check(address, signal);
    await this.opts.cache?.set(result);
    return result;
  }

  private async check(address: string, signal?: AbortSignal): Promise<VerifyResult> {
    const domain = domainOf(address);
    if (isDisposableDomain(domain)) return { address, verification: 'risky', mxHost: null, reason: 'disposable' };

    const mx = await this.mx(domain);
    if (mx.kind === 'none') return { address, verification: 'invalid', mxHost: null, reason: 'no_mx' };
    if (mx.kind === 'null_mx') return { address, verification: 'invalid', mxHost: null, reason: 'null_mx' };
    if (mx.kind === 'error') return { address, verification: 'unknown', mxHost: null, reason: 'dns_error' };

    const primary = mx.hosts[0] ?? null;
    if (!this.opts.smtpEnabled) return { address, verification: 'unknown', mxHost: primary, reason: 'mx_only' };
    if (this.smtpBlocked) return { address, verification: 'unknown', mxHost: primary, reason: 'mx_only_port25_blocked' };

    const catchAllAt = this.catchAll.get(domain);
    if (catchAllAt && this.now() - catchAllAt < DOMAIN_TTL_MS) {
      return { address, verification: 'catch_all', mxHost: primary, reason: 'domain_catch_all' };
    }

    // Try at most two MX hosts, moving on only when we could not connect.
    let lastError = 'smtp_unreachable';
    for (const host of mx.hosts.slice(0, 2)) {
      if (signal?.aborted) break;
      try {
        const result = await this.mxLocks.run(host, () => this.probe(host, address, domain, signal));
        this.connectFailures.clear();
        return { ...result, mxHost: host };
      } catch (err) {
        if (err instanceof SmtpProbeError && err.stage === 'connect') {
          this.noteConnectFailure(host);
          lastError = 'smtp_unreachable';
          continue;
        }
        if (err instanceof SmtpProbeError && err.reply) {
          // MAIL FROM or HELO rejected: the server will not talk to us. Not evidence about the mailbox.
          return { address, verification: 'unknown', mxHost: host, reason: `smtp_${err.stage}_${err.reply.code}` };
        }
        lastError = err instanceof SmtpProbeError ? `smtp_${err.stage}_error` : 'smtp_error';
        break;
      }
    }
    return { address, verification: 'unknown', mxHost: primary, reason: lastError };
  }

  private async probe(
    host: string,
    address: string,
    domain: string,
    signal?: AbortSignal,
  ): Promise<Omit<VerifyResult, 'mxHost'>> {
    // Another job may have learned about this domain while we waited for the lock.
    const known = this.catchAll.get(domain);
    if (known && this.now() - known < DOMAIN_TTL_MS) {
      return { address, verification: 'catch_all', reason: 'domain_catch_all' };
    }
    const decoy = `${randomLocal()}@${domain}`;
    const res = await smtpProbe({
      host,
      port: this.opts.port,
      heloName: this.opts.heloName,
      mailFrom: this.opts.mailFrom,
      recipients: [address, decoy],
      connectTimeoutMs: this.opts.connectTimeoutMs,
      commandTimeoutMs: this.opts.commandTimeoutMs,
      connect: this.opts.connect,
      signal,
    });
    const real = res.recipients[0]?.reply;
    if (!real) return { address, verification: 'unknown', reason: 'no_rcpt_reply' };
    const verdict = classifyRcpt(real);
    if (verdict.verification === 'valid') {
      const decoyReply = res.recipients[1]?.reply;
      if (decoyReply && decoyReply.code >= 200 && decoyReply.code < 300) {
        this.catchAll.set(domain, this.now());
        return { address, verification: 'catch_all', reason: 'accepts_any_recipient' };
      }
    }
    return { address, ...verdict };
  }

  private noteConnectFailure(host: string): void {
    this.connectFailures.add(host);
    if (this.connectFailures.size >= PORT25_FAILURE_HOSTS) {
      this.port25BlockedUntil = this.now() + PORT25_BLOCK_MS;
      this.connectFailures.clear();
    }
  }

  private mx(domain: string): Promise<MxLookup> {
    const hit = this.mxCache.get(domain);
    if (hit && this.now() - hit.at < DOMAIN_TTL_MS) return hit.value;
    const value = lookupMx(domain, this.dns);
    this.mxCache.set(domain, { at: this.now(), value });
    if (this.mxCache.size > 20_000) {
      const oldest = this.mxCache.keys().next().value;
      if (oldest !== undefined) this.mxCache.delete(oldest);
    }
    return value;
  }
}

/** How long a cached result stays fresh. */
export function ttlFor(verification: Verification): number {
  return verification === 'unknown' ? UNKNOWN_TTL_MS : CACHE_TTL_MS;
}
