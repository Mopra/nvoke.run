import { describe, expect, it } from 'vitest';
import { certProblem, hostsFor, recheckSsl, type CertSeen } from './recheck.js';

const NOW = new Date('2026-10-23T12:00:00Z');
const days = (n: number) => new Date(NOW.getTime() + n * 86_400_000);
const ok = (validTo: Date, o: Partial<CertSeen> = {}): CertSeen => ({
  validFrom: new Date(validTo.getTime() - 90 * 86_400_000),
  validTo,
  nameMismatch: false,
  selfSigned: false,
  ...o,
});

describe('certProblem', () => {
  it('is a problem while the certificate is expired, runs out within 30 days, names another host or signs itself', () => {
    expect(certProblem(ok(days(-3)), NOW)).toBe(true);
    expect(certProblem(ok(days(19)), NOW)).toBe(true);
    expect(certProblem(ok(days(85)), NOW)).toBe(false);
    expect(certProblem(ok(days(85), { nameMismatch: true }), NOW)).toBe(true);
    expect(certProblem(ok(days(300), { selfSigned: true }), NOW)).toBe(true);
    // A www host the certificate leaves out is common on a healthy site.
    expect(certProblem(ok(days(85), { nameMismatch: true }), NOW, true)).toBe(false);
    // A short lived certificate is a problem only in the last third of its life.
    expect(certProblem(ok(days(20), { validFrom: days(-25) }), NOW)).toBe(false);
    expect(certProblem(ok(days(5), { validFrom: days(-40) }), NOW)).toBe(true);
  });
});

describe('recheckSsl', () => {
  it('checks the apex and the www host', async () => {
    expect(hostsFor('www.Acme.com')).toEqual(['acme.com', 'www.acme.com']);
    const asked: string[] = [];
    await recheckSsl('acme.com', NOW, async (h) => {
      asked.push(h);
      return ok(days(80));
    });
    expect(asked.sort()).toEqual(['acme.com', 'www.acme.com']);
  });

  it('is resolved once every host that answers is fine, a problem while one is not, unreachable when none answers', async () => {
    expect(await recheckSsl('acme.com', NOW, async () => ok(days(89)))).toBe('resolved');
    expect(await recheckSsl('acme.com', NOW, async (h) => (h.startsWith('www.') ? ok(days(-1)) : ok(days(89))))).toBe('problem');
    expect(await recheckSsl('acme.com', NOW, async (h) => (h.startsWith('www.') ? null : ok(days(5))))).toBe('problem');
    expect(await recheckSsl('acme.com', NOW, async () => null)).toBe('unreachable');
    expect(
      await recheckSsl('acme.com', NOW, async () => {
        throw new Error('boom');
      }),
    ).toBe('unreachable');
  });
});
