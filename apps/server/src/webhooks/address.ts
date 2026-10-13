// Webhook URLs point wherever the user says, and the request goes out from
// our VPS. These checks keep it on the public internet: a webhook must not
// reach localhost, the VPS's own network or cloud metadata endpoints.

import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import { BlockList, isIP, type LookupFunction } from 'node:net';

const blocked = new BlockList();
for (const [net, bits] of [
  ['0.0.0.0', 8], // this network
  ['10.0.0.0', 8], // private
  ['100.64.0.0', 10], // carrier grade NAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link local, cloud metadata
  ['172.16.0.0', 12], // private
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // documentation
  ['192.88.99.0', 24], // 6to4 relay
  ['192.168.0.0', 16], // private
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // documentation
  ['203.0.113.0', 24], // documentation
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved, broadcast
] as const) {
  blocked.addSubnet(net, bits, 'ipv4');
}
for (const [net, bits] of [
  ['::', 128], // unspecified
  ['::1', 128], // loopback
  ['100::', 64], // discard
  ['2001:db8::', 32], // documentation
  ['fc00::', 7], // unique local
  ['fe80::', 10], // link local
  ['ff00::', 8], // multicast
] as const) {
  blocked.addSubnet(net, bits, 'ipv6');
}

/** The IPv4 address inside an IPv4 mapped (::ffff:a.b.c.d) or NAT64 (64:ff9b::a.b.c.d) address. */
function embeddedIpv4(ip: string): string | null {
  const lower = ip.toLowerCase();
  const dotted = lower.match(/^(?:::ffff:|64:ff9b::)(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) return dotted[1]!;
  const hex = lower.match(/^(?:::ffff:|64:ff9b::)([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (!hex) return null;
  const hi = parseInt(hex[1]!, 16);
  const lo = parseInt(hex[2]!, 16);
  return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
}

/** True for an address on the public internet. */
export function isPublicAddress(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return !blocked.check(ip, 'ipv4');
  if (family !== 6) return false;
  const v4 = embeddedIpv4(ip);
  if (v4) return isIP(v4) === 4 && !blocked.check(v4, 'ipv4');
  return !blocked.check(ip, 'ipv6');
}

export class WebhookUrlError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'WebhookUrlError';
  }
}

export interface UrlPolicy {
  /** Local development only: allow http and private addresses. */
  allowPrivate: boolean;
}

/** Checks the form of a webhook URL. Throws WebhookUrlError. */
export function checkUrlShape(raw: string, policy: UrlPolicy): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new WebhookUrlError('not a URL');
  }
  if (url.protocol !== 'https:' && !(policy.allowPrivate && url.protocol === 'http:')) {
    throw new WebhookUrlError('must be https');
  }
  if (url.username || url.password) throw new WebhookUrlError('no credentials in the URL');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (!policy.allowPrivate) {
    if (isIP(host) && !isPublicAddress(host)) throw new WebhookUrlError('private address');
    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
      throw new WebhookUrlError('private address');
    }
  }
  return url;
}

export type Resolve = (host: string) => Promise<LookupAddress[]>;

const systemResolve: Resolve = (host) =>
  new Promise((resolve, reject) => {
    dnsLookup(host, { all: true, verbatim: true }, (err, addresses) => (err ? reject(err) : resolve(addresses)));
  });

/**
 * Resolves the host and keeps only public addresses. Throws WebhookUrlError
 * when it does not resolve, or when any address is private (a mixed answer
 * is how DNS rebinding starts).
 */
export async function resolvePublic(host: string, policy: UrlPolicy, resolve: Resolve = systemResolve): Promise<LookupAddress[]> {
  const bare = host.replace(/^\[|\]$/g, '');
  const family = isIP(bare);
  const addresses = family ? [{ address: bare, family }] : await resolve(bare).catch(() => []);
  if (addresses.length === 0) throw new WebhookUrlError('host does not resolve');
  if (!policy.allowPrivate && addresses.some((a) => !isPublicAddress(a.address))) {
    throw new WebhookUrlError('private address');
  }
  return addresses;
}

/** Shape and DNS together: what create and update run. */
export async function checkUrl(raw: string, policy: UrlPolicy, resolve?: Resolve): Promise<URL> {
  const url = checkUrlShape(raw, policy);
  await resolvePublic(url.hostname, policy, resolve);
  return url;
}

/**
 * A `lookup` for node:http(s) that answers only with addresses that passed
 * the check, so the socket connects to exactly what was checked.
 */
export function guardedLookup(policy: UrlPolicy, resolve?: Resolve): LookupFunction {
  return (hostname, options, callback) => {
    resolvePublic(hostname, policy, resolve).then(
      (addresses) => {
        const wanted = options.family === 4 || options.family === 6 ? addresses.filter((a) => a.family === options.family) : addresses;
        const list = wanted.length > 0 ? wanted : addresses;
        if (options.all) callback(null, list);
        else callback(null, list[0]!.address, list[0]!.family);
      },
      (err: Error) => callback(err as NodeJS.ErrnoException, '', 0),
    );
  };
}
