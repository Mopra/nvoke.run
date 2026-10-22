// Email verification: syntax, disposable domain list, freemail typos, MX
// records (with parked domains), then an SMTP RCPT probe (no message is ever
// sent) with catch-all detection against two random addresses. probeDomain
// finds a named person's address among pattern candidates in one session.
//
// Politeness: one SMTP connection per MX host at a time, checks of one domain
// that wait for it share a session, sessions are paced per mail provider
// under a global ceiling (pacing.ts), a domain's catch-all verdict is
// remembered for an hour so the same server is not asked again, and results
// are cached per address by the caller's cache (30 days, the whole retention,
// except 1 day for "unknown"; docs/research/cost.md). A greylisted answer is never cached: the pipeline retries it.
// Sessions go over IPv6 when the MX host has an AAAA record, since the VPS
// provider throttles port 25 on IPv4 only, then over this machine's IPv4,
// then through each relay's. Each way out (lane) has its own budget and its
// own port 25 check: when one lane's port 25 turns out to be unreachable,
// only that lane pauses. A check no lane can take now says so (smtp_paced,
// mx_only_port25_blocked, smtp_throttled; isCapacityDeferral) and the
// pipeline asks again later instead of settling it as unknown.
//
// Second chances before unknown: an IPv4 lane that cannot reach the MX host
// hands the session to the next lane with a free slot (the Hostinger
// throttle shows up as connect timeouts on this machine's lane only). A host
// that greylisted us is asked again from the same route it saw (greylisting
// remembers the sending IP), with the same decoys (fresh random decoys would
// be greylisted anew on every retry). recheck.ts asks settled unknowns again
// hours later.

import * as net from 'node:net';
import { networkInterfaces } from 'node:os';
import { randomBytes } from 'node:crypto';
import { isDisposableEmailDomain } from 'disposable-email-domains-js';
import type { Verification } from '@nvoke/shared';
import { normalizeEmail, domainOf } from '../extract.js';
import { KeyedMutex } from '../limits.js';
import { lookupMx, systemDns, type DnsLike, type MxLookup } from './mx.js';
import { mailProvider, PacedError, registrableDomain, SessionPacer, type Limit } from './pacing.js';
import { smtpProbe, SmtpProbeError, type SmtpProbeOptions, type SmtpProbeResult, type SmtpReply } from './smtp.js';
import { RelayDownError, socksConnect, type SocksProxy } from './socks.js';

export interface VerifyResult {
  address: string;
  verification: Verification;
  mxHost: string | null;
  /** Short machine readable reason, for logs and the email_checks row. */
  reason: string;
  /** With reason `smtp_paced`: when a probe slot frees up. */
  retryAfterMs?: number;
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
  /**
   * Resolves true when outbound port 25 works on a lane (`ipv4` for this
   * machine, `ipv4:relay0` and so on for the relays): asked before concluding
   * it is blocked, since dead or slow MX hosts also fail to connect. Defaults
   * to TCP connects to the canaries over that lane.
   */
  port25Works?: (lane: string) => Promise<boolean>;
  /** Called each time a lane stops probing because its port 25 looks blocked, to tell the operator. */
  onPort25Blocked?: (lane: string) => void;
  /**
   * SMTP sessions opened per minute over IPv4, across all hosts. The VPS
   * provider cuts IPv4 port 25 off for a long while when a burst goes past
   * its limit (Hostinger: about 5 a minute). 0 means no limit.
   */
  probesPerMinute?: number;
  /** SMTP sessions per minute in all, IPv4 and IPv6. 0 means no limit. */
  sessionsPerMinute?: number;
  /** SMTP sessions per minute to one mail provider (Google, Microsoft, else the MX domain). 0 means no limit. */
  sessionsPerProviderPerMinute?: number;
  /** Connect over IPv6 when the MX host has an AAAA record, falling back to IPv4. Default true. */
  preferIpv6?: boolean;
  /**
   * True when this machine can reach the IPv6 internet. Default checks for a
   * global unicast IPv6 address on a network interface. Without one, IPv6 is
   * never tried: connecting to an AAAA from an IPv4-only host fails and must
   * not be mistaken for a blocked port 25.
   */
  ipv6Available?: () => boolean;
  /**
   * Other servers to send IPv4 sessions out through, each with its own IPv4
   * cap (`probesPerMinute`) and the HELO name matching its reverse DNS. Used
   * when this machine's IPv4 slots for the minute are taken.
   */
  relays?: SmtpRelay[];
  now?: () => number;
}

export interface SmtpRelay {
  socks: SocksProxy;
  heloName: string;
  /** IPv4 sessions per minute through this relay. Default `probesPerMinute`. */
  perMinute?: number;
}

/** One way out over IPv4: this machine, or a relay. */
interface Ipv4Lane {
  limit: Limit;
  heloName: string;
  open?: SmtpProbeOptions['open'];
}

/** How long a relay that is down is left alone. */
const RELAY_DOWN_MS = 60_000;
/**
 * How long a host that greylisted us keeps its route (IPv6 or one IPv4
 * lane) and a domain its decoys: long enough for the pipeline's retries and
 * a capacity wait or two, so the retry looks like the same sender.
 */
const GREYLIST_ROUTE_MS = 6 * 60 * 60_000;
const DECOY_TTL_MS = 6 * 60 * 60_000;

export const CACHE_TTL_MS = 30 * 24 * 60 * 60_000;
export const VALID_TTL_MS = 30 * 24 * 60 * 60_000;
export const UNKNOWN_TTL_MS = 24 * 60 * 60_000;

/**
 * Worth asking again later: a 4xx RCPT reply (greylisting), or a mail server
 * we could not connect to or that stalled mid session. Big providers (Google,
 * Microsoft) drop or stall connections for a few minutes when one IP probes
 * many of their domains in a row, and the same address checks fine a few
 * minutes later. Also while port 25 looks blocked, which may pass.
 */
export function isTempfail(result: Pick<VerifyResult, 'reason'>): boolean {
  const r = result.reason;
  return (
    r.startsWith('rcpt_tempfail_') ||
    // The server dropped before replying to this address (often a 421 to the recipient before it).
    r === 'no_rcpt_reply' ||
    r === 'smtp_unreachable' ||
    r === 'smtp_throttled' ||
    r === 'mx_only_port25_blocked' ||
    /^smtp_[a-z]+_error$/.test(r) ||
    // A 4xx at the banner, HELO or MAIL FROM: the server is busy or throttling us.
    /^smtp_(banner|helo|mail)_4\d\d$/.test(r)
  );
}

/**
 * Reasons that say we could not ask, on our side: every lane at its budget
 * (smtp_paced), every IPv4 lane paused with port 25 blocked, Google or
 * Microsoft refusing or stalling our connection (throttling us), the job
 * running out of time while it waited for the MX host. Nothing about the
 * mailbox and no answer from its server, so the pipeline queues the check
 * again with backoff instead of counting a retry or settling it unknown.
 */
const CAPACITY_REASONS = new Set(['smtp_paced', 'mx_only_port25_blocked', 'smtp_throttled', 'aborted']);

export function isCapacityDeferral(result: Pick<VerifyResult, 'reason'>): boolean {
  return CAPACITY_REASONS.has(result.reason);
}

/** Common misspellings of freemail domains. Nobody owns a mailbox there. */
const TYPO_DOMAINS = new Set([
  'gmial.com', 'gamil.com', 'gmai.com', 'gmal.com', 'gmaill.com', 'gnail.com', 'gmail.con',
  'hotmial.com', 'hotmal.com', 'hotmai.com', 'hotmil.com', 'hotmail.con',
  'yaho.com', 'yahooo.com', 'yahoo.con',
  'outlok.com', 'outllook.com', 'outlook.con',
  'iclod.com', 'icoud.com', 'icloud.con',
]);

export function isTypoDomain(domain: string): boolean {
  return TYPO_DOMAINS.has(domain.toLowerCase());
}

/** Mail exchangers run by domain parking and for-sale services: nobody reads mail there. */
const PARKING_MX = /(^|\.)(sedoparking\.com|parkingcrew\.net|bodis\.com|above\.com)$/;

export function isParkedMx(host: string): boolean {
  return PARKING_MX.test(host.toLowerCase());
}

/** Results that say nothing about the mailbox: probing off or blocked, a resolver hiccup. */
const UNCACHED_REASONS = new Set(['mx_only', 'mx_only_port25_blocked', 'dns_error', 'smtp_paced', 'smtp_throttled', 'aborted']);

const DOMAIN_TTL_MS = 60 * 60_000;
/** How long a lane pauses once its port 25 looks blocked. The next failure asks the canaries again. */
const PORT25_BLOCK_MS = 10 * 60_000;
/** Connection failures on one lane at this many distinct MX providers, with no success in between, make us ask whether its port 25 is blocked. */
const PORT25_FAILURE_HOSTS = 5;
/** Mail exchangers of three providers that take connections on port 25 whenever the network lets us. */
const PORT25_CANARIES = ['gmail-smtp-in.l.google.com', 'mx01.mail.icloud.com', 'mta5.am0.yahoodns.net'];
/** How long a provider gets no sessions after it hung up on us with 421. */
const SLOW_DOWN_MS = 5 * 60_000;
/** IPv6 connect failures in a row, across hosts, that switch IPv6 off for IPV6_OFF_MS. */
const IPV6_FAIL_STREAK = 5;
const IPV6_OFF_MS = 30 * 60_000;

/** The provider behind an MX host, by its registrable domain: aspmx.l.google.com and alt1.aspmx.l.google.com are both google.com. */
export function mxProvider(host: string): string {
  return registrableDomain(host);
}

/**
 * True when port 25 of any canary takes a TCP connection within 10
 * seconds, over IPv4 (the family the VPS provider blocks). `pace` is asked
 * before each connection and skips a canary when it returns false; with
 * every canary skipped the answer is true, since nothing proves a block.
 * `open` connects another way (through a relay) instead of from here.
 */
export async function port25Works(
  connect?: SmtpProbeOptions['connect'],
  pace: () => boolean = () => true,
  open?: (host: string) => Promise<boolean>,
): Promise<boolean> {
  const hosts = PORT25_CANARIES.filter(() => pace());
  if (hosts.length === 0) return true;
  const results = await Promise.all(hosts.map((host) => (open ? open(host) : port25Open(connect, host))));
  return results.some(Boolean);
}

/** Google and Microsoft refuse or stall connections from an IP that probes many of their domains: that is us being throttled. */
function throttledBy(host: string, err: SmtpProbeError): boolean {
  const provider = mailProvider(host);
  if (provider !== 'google' && provider !== 'outlook') return false;
  if (err.stage === 'connect') return true;
  return err.stage === 'banner' && (!err.reply || (err.reply.code >= 400 && err.reply.code < 500));
}

/** True when a TCP connection to port 25 of `host` opens within 10 seconds, over IPv4. */
export function port25Open(connect: SmtpProbeOptions['connect'] | undefined, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = (connect ?? ((p, h) => net.connect({ port: p, host: h, family: 4 })))(25, host);
    const done = (ok: boolean) => {
      clearTimeout(timer);
      socket.destroy();
      resolve(ok);
    };
    const timer = setTimeout(() => done(false), 10_000);
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
}

/**
 * True when a network interface has a global unicast IPv6 address, so this
 * machine can reach the IPv6 internet. Link-local (fe80::/10), unique local
 * (fc00::/7, the fd00:: ULAs a home router hands out) and the loopback (::1)
 * do not count: a host with only those cannot open an IPv6 connection to a
 * mail server.
 */
export function hasGlobalUnicastIpv6(): boolean {
  let interfaces: ReturnType<typeof networkInterfaces>;
  try {
    interfaces = networkInterfaces();
  } catch {
    // A systemd sandbox without netlink (RestrictAddressFamilies) cannot list
    // interfaces. Try IPv6 then: a failed connect falls back to IPv4 anyway.
    return true;
  }
  for (const addrs of Object.values(interfaces)) {
    for (const a of addrs ?? []) {
      if (a.internal || a.family !== 'IPv6') continue;
      const first = Number.parseInt(a.address.split(':')[0] || '0', 16);
      const isLinkLocal = (first & 0xffc0) === 0xfe80;
      const isUniqueLocal = (first & 0xfe00) === 0xfc00;
      if (!isLinkLocal && !isUniqueLocal && a.address !== '::1') return true;
    }
  }
  return false;
}

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
  // Microsoft 365 refuses unknown recipients with "5.4.1 Recipient address rejected: Access denied".
  if (reply.enhanced === '5.4.1' && /recipient address rejected/i.test(text)) return { verification: 'invalid', reason: `rcpt_rejected_${reply.code}` };
  if (POLICY_HINT.test(text)) return { verification: 'unknown', reason: `smtp_policy_${reply.code}` };
  if (reply.code === 550 || reply.code === 551 || reply.code === 553) {
    return { verification: 'invalid', reason: `rcpt_rejected_${reply.code}` };
  }
  return { verification: 'unknown', reason: `rcpt_${reply.code}` };
}

/** Sets a key as the newest entry of a map kept to 20,000 entries, dropping the oldest. */
function remember<V>(map: Map<string, V>, key: string, value: V): void {
  map.delete(key);
  map.set(key, value);
  if (map.size > 20_000) {
    const oldest = map.keys().next().value;
    if (oldest !== undefined) map.delete(oldest);
  }
}

function randomLocal(): string {
  return `nvoke-${randomBytes(6).toString('hex')}-nx`;
}

/**
 * True when a reply in the session is a policy block (5.7.x, blocklist, bad
 * PTR): the sending IP is refused, so the answers say nothing about any
 * mailbox. A 4xx greylist or a per-recipient 5.1.x is not a policy block.
 */
function isPolicyBlocked(res: SmtpProbeResult): boolean {
  return res.recipients.some(({ reply }) => classifyRcpt(reply).reason.startsWith('smtp_policy_'));
}

/** One address to try for a person in a domain probe. */
export interface ProbeCandidate {
  address: string;
  /**
   * The pattern behind the address (first.last, say). Once a candidate with
   * a tag is accepted, later groups try their candidate with the same tag first.
   */
  tag?: string;
}

export interface DomainProbe {
  domain: string;
  mxHost: string | null;
  /** True when the server accepted a random address, false when it refused one, null when not asked. */
  catchAll: boolean | null;
  /** Per group: the accepted address, or null. Always null on a catch-all domain. */
  accepted: Array<string | null>;
  /** Every candidate answered, from the cache or the server, in order. */
  results: VerifyResult[];
  /** Why the probe ended before trying every group (smtp_paced, no_mx, rcpt_tempfail_451, ...). Null otherwise. */
  reason: string | null;
  /** With reason `smtp_paced`: when a session slot frees up. */
  retryAfterMs?: number;
}

/** RCPT commands one domain probe sends at most, the decoy included. */
export const DOMAIN_PROBE_MAX_RCPT = 6;
/** Addresses of one domain checked in one session by verify(). */
const BATCH_MAX = 5;

type Gate = { ok: true; hosts: string[]; primary: string } | { ok: false; result: Omit<VerifyResult, 'address'> };

type Session<T> = { ok: true; host: string; value: T } | { ok: false; host: string | null; reason: string; retryAfterMs?: number };

interface Batch {
  domain: string;
  addresses: Map<string, Array<(r: VerifyResult) => void>>;
  sealed: boolean;
  controller: AbortController;
  open: number;
}

const KNOWN = (verdict: Verification) => verdict === 'valid' || verdict === 'invalid' || verdict === 'risky';

export class Verifier {
  private readonly dns: DnsLike;
  private readonly mxLocks = new KeyedMutex();
  private readonly mxCache = new Map<string, { at: number; value: Promise<MxLookup> }>();
  /** Per domain, when a random address was last accepted (catch-all) or refused. */
  private readonly catchAll = new Map<string, number>();
  private readonly notCatchAll = new Map<string, number>();
  /** Per IPv4 lane, the MX providers that would not take a connection since its last success. */
  private readonly connectFailures = new Map<string, Set<string>>();
  /** Per IPv4 lane, until when it is paused because its port 25 looks blocked. */
  private readonly laneBlockedUntil = new Map<string, number>();
  private readonly port25Checks = new Map<string, Promise<void>>();
  private readonly pacer: SessionPacer;
  private readonly batches = new Map<string, Batch>();
  private readonly ipv6Cache = new Map<string, { at: number; value: Promise<string | null> }>();
  /** MX hosts whose IPv6 address failed us, and when. */
  private readonly ipv6Failed = new Map<string, number>();
  private ipv6FailStreak = 0;
  /** Per MX host that greylisted us: the route it saw us on ('ipv6' or an IPv4 lane key), and when. */
  private readonly greylistRoutes = new Map<string, { route: string; at: number }>();
  /** Per domain, the random decoys its sessions ask about, kept so a greylisted retry asks the same ones. */
  private readonly decoys = new Map<string, { at: number; locals: string[] }>();
  private ipv6OffUntil = 0;
  private readonly now: () => number;
  /** Whether this machine can reach the IPv6 internet, decided once at start. */
  private readonly ipv6Available: boolean;

  constructor(private readonly opts: VerifierOptions) {
    this.dns = opts.dns ?? systemDns();
    this.now = opts.now ?? Date.now;
    this.pacer = new SessionPacer(this.now);
    this.ipv6Available = opts.preferIpv6 === false ? false : (opts.ipv6Available ?? hasGlobalUnicastIpv6)();
  }

  /** This machine's IPv4 session cap, counted on every IPv4 connection from here (fallbacks and canaries included). */
  private ipv4Limit(): Limit {
    return { key: 'ipv4', perMinute: this.opts.probesPerMinute ?? 0 };
  }

  /** The ways out over IPv4: this machine first, then each relay under its own cap. */
  private ipv4Lanes(): Ipv4Lane[] {
    const relays = (this.opts.relays ?? []).map(
      (relay, i): Ipv4Lane => ({
        limit: { key: `ipv4:relay${i}`, perMinute: relay.perMinute ?? this.opts.probesPerMinute ?? 0 },
        heloName: relay.heloName,
        open: async (port, host, timeoutMs) => {
          // Resolved here, so the relay connects over IPv4 to the address we chose.
          const ip = net.isIPv4(host) ? host : (await this.dns.resolve4(host))[0];
          if (!ip) throw new Error(`no IPv4 address for ${host}`);
          return socksConnect(relay.socks, ip, port, timeoutMs);
        },
      }),
    );
    return [{ limit: this.ipv4Limit(), heloName: this.opts.heloName }, ...relays];
  }

  /**
   * Takes a slot on the first IPv4 lane with one free, skipping lanes paused
   * with port 25 blocked, or throws PacedError with the shortest wait
   * (marked port25Blocked when every lane is paused).
   */
  private takeIpv4(extra: Limit[], pick: { only?: string; skip?: Set<string> } = {}): Ipv4Lane {
    let wait = Infinity;
    const lanes = this.ipv4Lanes().filter((l) => (pick.only ? l.limit.key === pick.only : !pick.skip?.has(l.limit.key)));
    let blocked = 0;
    for (const lane of lanes) {
      const until = this.laneBlockedUntil.get(lane.limit.key) ?? 0;
      if (until > this.now()) {
        blocked++;
        wait = Math.min(wait, until - this.now());
        continue;
      }
      try {
        this.pacer.take([...extra, lane.limit]);
        return lane;
      } catch (err) {
        if (!(err instanceof PacedError)) throw err;
        wait = Math.min(wait, err.retryAfterMs);
      }
    }
    throw new PacedError(wait, lanes.length > 0 && blocked === lanes.length);
  }

  /** True while every IPv4 lane is paused because its port 25 looks blocked. IPv6 may still work. */
  get smtpBlocked(): boolean {
    return this.ipv4Lanes().every((lane) => (this.laneBlockedUntil.get(lane.limit.key) ?? 0) > this.now());
  }

  /** True when the domain accepted a random address within the hour. */
  knownCatchAll(domain: string): boolean {
    return this.fresh(this.catchAll, domain);
  }

  async verify(rawAddress: string, signal?: AbortSignal): Promise<VerifyResult> {
    const address = normalizeEmail(rawAddress);
    if (!address) return { address: rawAddress.toLowerCase(), verification: 'invalid', mxHost: null, reason: 'syntax' };

    const cached = await this.opts.cache?.get(address);
    if (cached) return cached;

    const result = await this.check(address, signal);
    await this.remember(result);
    return result;
  }

  /**
   * Finds which of a domain's candidate addresses exist, in one SMTP
   * session: a random decoy first (a server that accepts it accepts
   * anything, and the session ends there), then each group's candidates in
   * order until one is accepted, at most `maxRcpt` RCPT commands in all.
   * Every answer goes into the cache, so a later verify() of an accepted
   * address costs no session.
   */
  async probeDomain(
    rawDomain: string,
    groups: ProbeCandidate[][],
    opts: { signal?: AbortSignal; maxRcpt?: number } = {},
  ): Promise<DomainProbe> {
    const domain = rawDomain.toLowerCase();
    const out: DomainProbe = { domain, mxHost: null, catchAll: null, accepted: groups.map(() => null), results: [], reason: null };
    const gate = await this.gate(domain);
    if (!gate.ok) return { ...out, mxHost: gate.result.mxHost, reason: gate.result.reason };
    out.mxHost = gate.primary;

    // Answers from the cache first: an address checked last week needs no RCPT.
    const pending: ProbeCandidate[][] = [];
    for (const [g, group] of groups.entries()) {
      const left: ProbeCandidate[] = [];
      for (const c of group) {
        const address = normalizeEmail(c.address);
        if (!address || domainOf(address) !== domain) continue;
        const hit = await this.opts.cache?.get(address);
        if (!hit) {
          left.push({ ...c, address });
          continue;
        }
        out.results.push(hit);
        if (hit.verification === 'catch_all') this.catchAll.set(domain, this.now());
        if (hit.verification === 'valid') {
          out.accepted[g] = address;
          break;
        }
      }
      pending.push(out.accepted[g] ? [] : left);
    }
    if (this.knownCatchAll(domain)) return { ...out, catchAll: true, accepted: groups.map(() => null), reason: 'domain_catch_all' };
    if (pending.every((g) => g.length === 0)) return out;

    const maxRcpt = opts.maxRcpt ?? DOMAIN_PROBE_MAX_RCPT;
    // The groups the server is asked about, snapshotted so a retry over IPv4 starts the plan fresh.
    const groupsToAsk = pending.map((g) => g.slice());
    // Session state, rebuilt by makePlan for each attempt (a decoy that lands differently, an IPv4 retry).
    let work: ProbeCandidate[][] = [];
    let decoy: string | null = null;
    let asked: Array<{ address: string; group: number; tag?: string }> = [];
    let answered: SmtpProbeResult['recipients'] = [];
    let seen = 0;
    let stop: string | null = null;
    let winner: string | undefined;
    let current = -1;
    // Which groups this session accepted, so a retry can clear them before starting over.
    const sessionAccepted = groups.map(() => false);

    const take = (a: SmtpProbeResult['recipients']) => {
      answered = a;
      for (; seen < a.length; seen++) {
        const { reply } = a[seen]!;
        const ask = asked[seen]!;
        const verdict = classifyRcpt(reply);
        if (ask.group < 0) {
          if (verdict.verification === 'valid') {
            out.catchAll = true;
            stop = 'accepts_any_recipient';
          } else if (verdict.verification === 'invalid') out.catchAll = false;
          else stop = verdict.reason;
          continue;
        }
        if (verdict.verification === 'valid') {
          out.accepted[ask.group] = ask.address;
          sessionAccepted[ask.group] = true;
          winner ??= ask.tag;
        } else if (!KNOWN(verdict.verification)) stop = verdict.reason;
      }
    };

    const next = (a: SmtpProbeResult['recipients']): string | null => {
      take(a);
      if (stop || asked.length >= maxRcpt) return null;
      if (decoy && asked.length === 0) {
        asked.push({ address: decoy, group: -1 });
        return decoy;
      }
      for (let g = Math.max(0, current); g < work.length; g++) {
        const left = work[g]!;
        if (out.accepted[g] || left.length === 0) continue;
        if (g !== current) {
          current = g;
          // The pattern that just worked for a colleague is the only one tried (one RCPT, two for a name spelled two ways).
          if (winner) left.splice(0, left.length, ...left.filter((c) => c.tag === winner));
          if (left.length === 0) continue;
        }
        const c = left.shift()!;
        asked.push({ address: c.address, group: g, tag: c.tag });
        return c.address;
      }
      return null;
    };

    const makePlan = (): Pick<SmtpProbeOptions, 'recipients' | 'nextRecipient'> => {
      work = groupsToAsk.map((g) => g.slice());
      decoy = this.fresh(this.notCatchAll, domain) ? null : this.decoysFor(domain)[0]!;
      asked = [];
      answered = [];
      seen = 0;
      stop = null;
      winner = undefined;
      current = -1;
      // Drop anything the discarded attempt accepted, so the fresh session owns the verdict.
      for (let g = 0; g < groups.length; g++) {
        if (sessionAccepted[g]) {
          out.accepted[g] = null;
          sessionAccepted[g] = false;
        }
      }
      out.catchAll = decoy === null ? false : null;
      return { recipients: [], nextRecipient: next };
    };

    const session = await this.withMx(gate.hosts, opts.signal, async (host) => {
      if (this.knownCatchAll(domain)) return 'catch_all' as const;
      return this.smtp(host, makePlan, opts.signal);
    });
    // Replies that came in before a failure still count.
    take(answered);

    if (!session.ok) {
      out.reason = session.reason;
      if (session.retryAfterMs !== undefined) out.retryAfterMs = session.retryAfterMs;
    } else if (session.value === 'catch_all') {
      return { ...out, catchAll: true, accepted: groups.map(() => null), reason: 'domain_catch_all' };
    }
    const mxHost = session.host ?? gate.primary;
    out.mxHost = mxHost;
    if (out.catchAll === true) {
      this.catchAll.set(domain, this.now());
      out.accepted = groups.map(() => null);
      out.reason = 'accepts_any_recipient';
    } else {
      if (out.catchAll === false) this.notCatchAll.set(domain, this.now());
      if (stop) out.reason = stop;
    }

    for (const [i, { address, reply }] of answered.entries()) {
      if ((asked[i]?.group ?? -1) < 0) continue;
      const verdict = classifyRcpt(reply);
      const result: VerifyResult =
        verdict.verification === 'valid' && out.catchAll === true
          ? { address, verification: 'catch_all', mxHost, reason: 'accepts_any_recipient' }
          : { address, ...verdict, mxHost };
      out.results.push(result);
      await this.remember(result);
    }
    return out;
  }

  private async remember(result: VerifyResult): Promise<void> {
    // Answers that say nothing about the mailbox (probing switched off, a
    // resolver hiccup) are not worth remembering.
    // A greylisted answer is retried by the pipeline, so it is not cached either.
    if (!UNCACHED_REASONS.has(result.reason) && !isTempfail(result)) await this.opts.cache?.set(result);
  }

  /** Two random decoys for the domain, the same ones for DECOY_TTL_MS. */
  private decoysFor(domain: string): string[] {
    const hit = this.decoys.get(domain);
    if (hit && this.now() - hit.at < DECOY_TTL_MS) return hit.locals.map((l) => `${l}@${domain}`);
    const locals = [randomLocal(), randomLocal()];
    remember(this.decoys, domain, { at: this.now(), locals });
    return locals.map((l) => `${l}@${domain}`);
  }

  /** The route a host that greylisted us saw us on, while it is worth keeping. */
  private greylistRoute(host: string): string | null {
    const hit = this.greylistRoutes.get(host);
    if (!hit) return null;
    if (this.now() - hit.at < GREYLIST_ROUTE_MS) return hit.route;
    this.greylistRoutes.delete(host);
    return null;
  }

  /** Remembers the route of a session the host greylisted: a 4xx to a recipient, other than a 421 hang up. */
  private noteRoute(host: string, route: string, res: SmtpProbeResult): void {
    if (res.recipients.some(({ reply }) => reply.code >= 400 && reply.code < 500 && reply.code !== 421)) {
      remember(this.greylistRoutes, host, { route, at: this.now() });
    }
  }

  private fresh(map: Map<string, number>, domain: string): boolean {
    const at = map.get(domain);
    return at !== undefined && this.now() - at < DOMAIN_TTL_MS;
  }

  /** Everything decided without a session: syntax of the domain, MX records, probing switched off or blocked. */
  private async gate(domain: string): Promise<Gate> {
    if (isTypoDomain(domain)) return { ok: false, result: { verification: 'invalid', mxHost: null, reason: 'typo_domain' } };
    if (isDisposableDomain(domain)) return { ok: false, result: { verification: 'risky', mxHost: null, reason: 'disposable' } };

    const mx = await this.mx(domain);
    if (mx.kind === 'none') return { ok: false, result: { verification: 'invalid', mxHost: null, reason: 'no_mx' } };
    if (mx.kind === 'null_mx') return { ok: false, result: { verification: 'invalid', mxHost: null, reason: 'null_mx' } };
    if (mx.kind === 'error') return { ok: false, result: { verification: 'unknown', mxHost: null, reason: 'dns_error' } };

    const primary = mx.hosts[0] ?? null;
    if (mx.hosts.some(isParkedMx)) return { ok: false, result: { verification: 'invalid', mxHost: primary, reason: 'parked_domain' } };
    if (!this.opts.smtpEnabled) return { ok: false, result: { verification: 'unknown', mxHost: primary, reason: 'mx_only' } };
    // A blocked port 25 is decided per lane in smtp(): IPv6 and the relays may still work.
    return { ok: true, hosts: mx.hosts, primary: primary! };
  }

  private async check(address: string, signal?: AbortSignal): Promise<VerifyResult> {
    const domain = domainOf(address);
    const gate = await this.gate(domain);
    if (!gate.ok) return { address, ...gate.result };
    if (this.knownCatchAll(domain)) {
      return { address, verification: 'catch_all', mxHost: gate.primary, reason: 'domain_catch_all' };
    }
    return this.batched(domain, address, gate, signal);
  }

  /**
   * Checks of one domain that wait for the same mail server share a
   * session: whoever arrives while a batch waits for its MX lock joins it.
   */
  private batched(domain: string, address: string, gate: Extract<Gate, { ok: true }>, signal?: AbortSignal): Promise<VerifyResult> {
    return new Promise<VerifyResult>((resolve) => {
      let batch = this.batches.get(domain);
      if (!batch || batch.sealed || batch.addresses.size >= BATCH_MAX) {
        batch = { domain, addresses: new Map(), sealed: false, controller: new AbortController(), open: 0 };
        this.batches.set(domain, batch);
        void this.runBatch(batch, gate);
      }
      const b = batch;
      const waiters = b.addresses.get(address) ?? [];
      waiters.push(resolve);
      b.addresses.set(address, waiters);
      // The session stops only when every caller in it gave up.
      b.open++;
      signal?.addEventListener(
        'abort',
        () => {
          if (--b.open === 0) b.controller.abort(signal.reason);
        },
        { once: true },
      );
    });
  }

  private async runBatch(batch: Batch, gate: Extract<Gate, { ok: true }>): Promise<void> {
    const { domain } = batch;
    const seal = () => {
      batch.sealed = true;
      if (this.batches.get(domain) === batch) this.batches.delete(domain);
      return [...batch.addresses.keys()];
    };
    const results = new Map<string, VerifyResult>();
    try {
      // Let callers of the same tick join before the first lock attempt.
      await new Promise<void>((resolve) => setImmediate(resolve));
      const session = await this.withMx(gate.hosts, batch.controller.signal, async (host) => {
        const addresses = seal();
        // Another session may have learned about this domain while we waited for the lock.
        if (this.knownCatchAll(domain)) {
          for (const a of addresses) results.set(a, { address: a, verification: 'catch_all', mxHost: host, reason: 'domain_catch_all' });
          return;
        }
        await this.probeAddresses(host, domain, addresses, results, batch.controller.signal);
      });
      const addresses = seal();
      for (const a of addresses) {
        if (results.has(a)) continue;
        const host = session.host ?? gate.primary;
        if (session.ok) results.set(a, { address: a, verification: 'unknown', mxHost: host, reason: 'no_rcpt_reply' });
        else {
          const r: VerifyResult = { address: a, verification: 'unknown', mxHost: host, reason: session.reason };
          if (session.retryAfterMs !== undefined) r.retryAfterMs = session.retryAfterMs;
          results.set(a, r);
        }
      }
    } catch {
      for (const a of seal()) {
        if (!results.has(a)) results.set(a, { address: a, verification: 'unknown', mxHost: gate.primary, reason: 'smtp_error' });
      }
    }
    for (const [address, waiters] of batch.addresses) {
      const r = results.get(address)!;
      for (const w of waiters) w(r);
    }
  }

  /**
   * One session for a batch: two random decoys first, then the addresses,
   * unless the domain refused a random address within the hour (then no
   * decoys). The decoys go first so a server that greylists or tarpits the
   * whole session (452 too many recipients, 450 tarpit) cannot leave a real
   * address looking valid: an accepted address is trusted only when a decoy
   * was refused with a 5xx in the same session, or a fresh domain verdict
   * already says the domain is not catch-all. A decoy accepted means the
   * domain takes anything, and the session stops there.
   */
  private async probeAddresses(
    host: string,
    domain: string,
    addresses: string[],
    results: Map<string, VerifyResult>,
    signal: AbortSignal,
  ): Promise<void> {
    const freshNotCatchAll = this.fresh(this.notCatchAll, domain);
    const decoys = freshNotCatchAll ? [] : this.decoysFor(domain);
    let answered: SmtpProbeResult['recipients'] = [];
    // A fresh plan per attempt, so an IPv4 retry after an IPv6 policy block asks every address again.
    const makePlan = (): Pick<SmtpProbeOptions, 'recipients' | 'nextRecipient'> => {
      const queue = [...decoys, ...addresses];
      return {
        recipients: [],
        nextRecipient: (a) => {
          answered = a;
          // A decoy was accepted: the domain takes anything, no need to ask the real addresses.
          if (a.some((r) => decoys.includes(r.address) && r.reply.code >= 200 && r.reply.code < 300)) return null;
          return queue.shift() ?? null;
        },
      };
    };
    try {
      await this.smtp(host, makePlan, signal);
    } finally {
      const replies = new Map(answered.map((r) => [r.address, r.reply]));
      const decoyReplies = decoys.map((d) => replies.get(d)).filter((r): r is SmtpReply => r !== undefined);
      const catchAll = decoyReplies.some((r) => r.code >= 200 && r.code < 300);
      const decoyRefused = decoyReplies.some((r) => classifyRcpt(r).verification === 'invalid');
      if (catchAll) this.catchAll.set(domain, this.now());
      else if (decoyReplies.length === decoys.length && decoyReplies.length > 0 && decoyReplies.every((r) => classifyRcpt(r).verification === 'invalid')) {
        this.notCatchAll.set(domain, this.now());
      }
      // "valid" is only trustworthy once we know the domain does not accept everything.
      const catchAllRuledOut = freshNotCatchAll || decoyRefused;
      for (const address of addresses) {
        const reply = replies.get(address);
        // A decoy was accepted, so the session stopped before this address: the domain is catch-all.
        if (!reply) {
          if (catchAll) results.set(address, { address, verification: 'catch_all', mxHost: host, reason: 'accepts_any_recipient' });
          continue;
        }
        const verdict = classifyRcpt(reply);
        if (verdict.verification === 'valid' && catchAll) {
          results.set(address, { address, verification: 'catch_all', mxHost: host, reason: 'accepts_any_recipient' });
        } else if (verdict.verification === 'valid' && !catchAllRuledOut) {
          // The decoys were not refused with a 5xx (greylisted, tarpitted or the session dropped): ask again later.
          results.set(address, { address, verification: 'unknown', mxHost: host, reason: 'rcpt_tempfail_decoy' });
        } else results.set(address, { address, ...verdict, mxHost: host });
      }
    }
  }

  /**
   * Runs `fn` under the MX host's lock, trying at most two MX hosts and
   * moving on only when one would not take a connection.
   */
  private async withMx<T>(hosts: string[], signal: AbortSignal | undefined, fn: (host: string) => Promise<T>): Promise<Session<T>> {
    let lastError = 'smtp_unreachable';
    let lastHost: string | null = hosts[0] ?? null;
    for (const host of hosts.slice(0, 2)) {
      if (signal?.aborted) break;
      lastHost = host;
      try {
        const value = await this.mxLocks.run(host, () => fn(host), signal);
        return { ok: true, host, value };
      } catch (err) {
        if (err instanceof PacedError) {
          return { ok: false, host, reason: err.port25Blocked ? 'mx_only_port25_blocked' : 'smtp_paced', retryAfterMs: err.retryAfterMs };
        }
        // A job that timed out or was canceled opened no real connection: not evidence about port 25.
        if (signal?.aborted || (err instanceof Error && err.name === 'AbortError')) return { ok: false, host, reason: 'aborted' };
        if (err instanceof SmtpProbeError && throttledBy(host, err)) {
          lastError = 'smtp_throttled';
          // The provider is pushing back: every check waiting for it holds off, not just this one.
          this.pacer.cool(`provider:${mailProvider(host)}`, SLOW_DOWN_MS);
          if (err.stage === 'connect') continue;
          break;
        }
        if (err instanceof SmtpProbeError && err.stage === 'connect') {
          lastError = 'smtp_unreachable';
          continue;
        }
        if (err instanceof SmtpProbeError && err.reply) {
          // MAIL FROM or HELO rejected: the server will not talk to us. Not evidence about the mailbox.
          return { ok: false, host, reason: `smtp_${err.stage}_${err.reply.code}` };
        }
        lastError = err instanceof SmtpProbeError ? `smtp_${err.stage}_error` : 'smtp_error';
        break;
      }
    }
    return { ok: false, host: lastHost, reason: lastError };
  }

  /**
   * One SMTP session with an MX host, paced: over IPv6 when the host has an
   * AAAA record (and IPv6 works from here), else or on failure over IPv4.
   */
  private async smtp(
    host: string,
    makePlan: () => Pick<SmtpProbeOptions, 'recipients' | 'nextRecipient'>,
    signal?: AbortSignal,
  ): Promise<SmtpProbeResult> {
    const provider = mailProvider(host);
    const shared: Limit[] = [
      { key: 'all', perMinute: this.opts.sessionsPerMinute ?? 0 },
      { key: `provider:${provider}`, perMinute: this.opts.sessionsPerProviderPerMinute ?? 0 },
    ];
    const run = (target: string, lane?: Ipv4Lane) =>
      smtpProbe({
        ...makePlan(),
        host: target,
        family: lane ? 4 : undefined,
        port: this.opts.port,
        heloName: lane?.heloName ?? this.opts.heloName,
        mailFrom: this.opts.mailFrom,
        connectTimeoutMs: this.opts.connectTimeoutMs,
        commandTimeoutMs: this.opts.commandTimeoutMs,
        connect: this.opts.connect,
        open: lane?.open,
        signal,
      }).then(
        (res) => {
          if (res.banner.code === 421 || res.recipients.some((r) => r.reply.code === 421)) this.pacer.cool(`provider:${provider}`, SLOW_DOWN_MS);
          return res;
        },
        (err: unknown) => {
          if (err instanceof SmtpProbeError && err.reply?.code === 421) this.pacer.cool(`provider:${provider}`, SLOW_DOWN_MS);
          throw err;
        },
      );

    // Over IPv4 on a lane with a free slot. A relay that is down is cooled and the next lane tried.
    // A connect failure counts against the lane it happened on, so a blocked lane pauses alone,
    // and the session moves to the next lane with a slot free now: the server never saw us, so
    // to it this is still one session. Each lane is tried once and pays its own slot. `only`
    // keeps a host that greylisted us on the lane it saw; that lane at its budget means a wait.
    const runIpv4 = async (extra: Limit[], only?: string): Promise<SmtpProbeResult> => {
      const tried = new Set<string>();
      let unreachable: unknown = null;
      for (;;) {
        let lane: Ipv4Lane;
        try {
          lane = this.takeIpv4(extra, tried.size === 0 && only ? { only } : { skip: tried });
        } catch (err) {
          // No other lane free right now: the connect failure stands, and the pipeline retries it.
          if (unreachable && err instanceof PacedError) throw unreachable;
          throw err;
        }
        extra = [];
        tried.add(lane.limit.key);
        try {
          const res = await run(host, lane);
          this.connectFailures.delete(lane.limit.key);
          this.noteRoute(host, lane.limit.key, res);
          return res;
        } catch (err) {
          if (err instanceof RelayDownError) {
            this.pacer.cool(lane.limit.key, RELAY_DOWN_MS);
            continue;
          }
          if (err instanceof SmtpProbeError && err.stage === 'connect' && !signal?.aborted) {
            await this.noteConnectFailure(host, lane);
            unreachable = err;
            continue;
          }
          throw err;
        }
      }
    };

    // A host that greylisted us over IPv4 is asked from the same lane, so the retry passes its greylist.
    const sticky = this.greylistRoute(host);
    // A lane gone from the config or paused with port 25 blocked cannot keep it.
    const stickyLane = sticky && sticky !== 'ipv6' && (this.laneBlockedUntil.get(sticky) ?? 0) <= this.now() ? sticky : null;
    if (stickyLane && this.ipv4Lanes().some((l) => l.limit.key === stickyLane)) return runIpv4(shared, stickyLane);
    const v6 = await this.ipv6Of(host);
    if (!v6) return runIpv4(shared);
    this.pacer.take(shared);
    // Falls back to IPv4 for this host, counting the IPv6 attempt as a failure.
    const overIpv4 = (unreachable: boolean) => {
      this.ipv6Failed.set(host, this.now());
      if (unreachable && ++this.ipv6FailStreak >= IPV6_FAIL_STREAK) this.ipv6OffUntil = this.now() + IPV6_OFF_MS;
      return runIpv4([]);
    };
    let res: SmtpProbeResult;
    try {
      res = await run(v6);
    } catch (err) {
      // Only a server we never got to talk to over IPv6 is worth a second try over IPv4.
      const unreachable = err instanceof SmtpProbeError && err.stage === 'connect';
      const refused = err instanceof SmtpProbeError && err.reply !== undefined && err.reply.code >= 500 && err.stage !== 'rcpt';
      if (!unreachable && !refused) throw err;
      return overIpv4(unreachable);
    }
    // A policy rejection (550 5.7.1 blocked, Spamhaus, bad PTR) over IPv6 is about the IPv6 source,
    // not the mailbox. The configured egress is IPv4, so retry there rather than cache a false unknown.
    if (isPolicyBlocked(res)) return overIpv4(false);
    this.ipv6FailStreak = 0;
    this.noteRoute(host, 'ipv6', res);
    return res;
  }

  /** An IPv6 address of the MX host to connect to, or null for IPv4. */
  private ipv6Of(host: string): Promise<string | null> {
    if (!this.ipv6Available || this.now() < this.ipv6OffUntil) return Promise.resolve(null);
    if (net.isIP(host)) return Promise.resolve(net.isIPv6(host) ? host : null);
    const failed = this.ipv6Failed.get(host);
    if (failed !== undefined && this.now() - failed < DOMAIN_TTL_MS) return Promise.resolve(null);
    const hit = this.ipv6Cache.get(host);
    if (hit && this.now() - hit.at < DOMAIN_TTL_MS) return hit.value;
    const value = this.dns.resolve6(host).then(
      (addrs) => addrs[0] ?? null,
      () => null,
    );
    this.ipv6Cache.set(host, { at: this.now(), value });
    if (this.ipv6Cache.size > 5_000) {
      const oldest = this.ipv6Cache.keys().next().value;
      if (oldest !== undefined) this.ipv6Cache.delete(oldest);
    }
    return value;
  }

  /**
   * Many MX hosts are dead or drop connections, so failures alone do not
   * prove a lane's port 25 is blocked. Past the threshold, the canaries
   * decide over that lane; only when none of them connects does the lane
   * pause, for 10 minutes. The other lanes go on.
   */
  private async noteConnectFailure(host: string, lane: Ipv4Lane): Promise<void> {
    const key = lane.limit.key;
    const failed = this.connectFailures.get(key) ?? new Set<string>();
    this.connectFailures.set(key, failed);
    // One provider throttling us (all of Google's aspmx hosts at once) is not a blocked port.
    failed.add(mxProvider(host));
    if (failed.size < PORT25_FAILURE_HOSTS) return;
    let check = this.port25Checks.get(key);
    if (!check) {
      check = (async () => {
        const works = await this.laneWorks(lane).catch(() => false);
        if (!works) {
          this.laneBlockedUntil.set(key, this.now() + PORT25_BLOCK_MS);
          this.opts.onPort25Blocked?.(key);
        }
        this.connectFailures.delete(key);
      })().finally(() => this.port25Checks.delete(key));
      this.port25Checks.set(key, check);
    }
    await check;
  }

  /** Asks the canaries over one lane. They are IPv4 connections like any other, so they count against its cap. */
  private laneWorks(lane: Ipv4Lane): Promise<boolean> {
    if (this.opts.port25Works) return this.opts.port25Works(lane.limit.key);
    const pace = () => {
      try {
        this.pacer.take([lane.limit]);
        return true;
      } catch {
        return false;
      }
    };
    const open = lane.open;
    if (!open) return port25Works(this.opts.connect, pace);
    return port25Works(undefined, pace, (canary) =>
      open(25, canary, 10_000).then(
        (socket) => {
          socket.destroy();
          return true;
        },
        (err: unknown) => {
          // A relay that is down proves nothing about its port 25: it is left alone for a minute instead.
          if (!(err instanceof RelayDownError)) return false;
          this.pacer.cool(lane.limit.key, RELAY_DOWN_MS);
          return true;
        },
      ),
    );
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
  if (verification === 'unknown') return UNKNOWN_TTL_MS;
  if (verification === 'valid') return VALID_TTL_MS;
  return CACHE_TTL_MS;
}
