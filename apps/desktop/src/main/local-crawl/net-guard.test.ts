import { describe, expect, it } from 'vitest';
import { isLocalHost, isPrivateAddress, resolvesPublic } from './net-guard';

describe('net guard', () => {
  it('refuses local names and private addresses', () => {
    const local = ['localhost', 'router', 'printer.local', 'nas.lan', '127.0.0.1', '10.0.0.8', '192.168.1.1', '172.20.1.1', '169.254.1.1', '100.64.0.1', '[::1]', 'fe80::1', 'fd00::1'];
    for (const host of local) expect(isLocalHost(host), host).toBe(true);
    expect(isLocalHost('acme.dk')).toBe(false);
    expect(isLocalHost('8.8.8.8')).toBe(false);
    expect(isPrivateAddress('::ffff:192.168.0.1')).toBe(true);
    expect(isPrivateAddress('2a00:1450:4001::1')).toBe(false);
  });

  it('needs every resolved address to be public', async () => {
    expect(await resolvesPublic('acme.dk', async () => ['93.184.216.34'])).toBe(true);
    expect(await resolvesPublic('rebind.dk', async () => ['93.184.216.34', '192.168.0.1'])).toBe(false);
    expect(await resolvesPublic('gone.dk', async () => Promise.reject(new Error('ENOTFOUND')))).toBe(false);
  });
});
