import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/**
 * Keeps the hidden crawl window on the public internet. A site must not be
 * able to point the user's own browser at their router, printer or other
 * machines on their network.
 */

const LOCAL_SUFFIXES = ['.local', '.localhost', '.internal', '.lan', '.home', '.home.arpa', '.intranet', '.corp'];

function ipv4Private(ip: string): boolean {
  const [a = 0, b = 0] = ip.split('.').map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

/** True for loopback, private, link local, CGNAT, multicast and reserved addresses, IPv4 and IPv6. */
export function isPrivateAddress(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) return ipv4Private(ip);
  if (kind !== 6) return true;
  const v6 = ip.toLowerCase();
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v6);
  if (mapped?.[1]) return ipv4Private(mapped[1]);
  return (
    v6 === '::' ||
    v6 === '::1' ||
    v6.startsWith('fc') ||
    v6.startsWith('fd') ||
    /^fe[89ab]/.test(v6) ||
    v6.startsWith('ff') ||
    v6.startsWith('64:ff9b:') ||
    v6.startsWith('2001:db8')
  );
}

/** True when a request to this host is refused without looking it up: a local name or a private literal address. */
export function isLocalHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (host === 'localhost' || (!host.includes('.') && isIP(host) === 0)) return true;
  if (LOCAL_SUFFIXES.some((s) => host.endsWith(s))) return true;
  return isIP(host) !== 0 && isPrivateAddress(host);
}

export type Resolver = (hostname: string) => Promise<string[]>;

const systemResolver: Resolver = async (hostname) => (await lookup(hostname, { all: true })).map((a) => a.address);

/** True when every address the host resolves to is public. A failed lookup is not public. */
export async function resolvesPublic(hostname: string, resolve: Resolver = systemResolver): Promise<boolean> {
  if (isLocalHost(hostname)) return false;
  try {
    const addresses = await resolve(hostname.replace(/^\[|\]$/g, ''));
    return addresses.length > 0 && addresses.every((a) => !isPrivateAddress(a));
  } catch {
    return false;
  }
}
