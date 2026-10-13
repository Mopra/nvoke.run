import { describe, expect, it } from 'vitest';
import { CodeChallenge, CodeVerifier, DesktopAuthorizeRequest, HealthResponse } from './api.js';

describe('HealthResponse', () => {
  it('accepts a valid payload', () => {
    const parsed = HealthResponse.parse({ status: 'ok', service: 'api', version: '0.1.0', uptimeSeconds: 1 });
    expect(parsed.status).toBe('ok');
  });

  it('rejects an unknown status', () => {
    expect(HealthResponse.safeParse({ status: 'down', service: 'api', version: '0.1.0', uptimeSeconds: 1 }).success).toBe(false);
  });
});

describe('desktop auth schemas', () => {
  it('accepts a 43 character base64url challenge only', () => {
    expect(CodeChallenge.safeParse('a'.repeat(43)).success).toBe(true);
    expect(CodeChallenge.safeParse('a'.repeat(42)).success).toBe(false);
    expect(CodeChallenge.safeParse(`${'a'.repeat(42)}=`).success).toBe(false);
  });

  it('enforces the RFC 7636 verifier length', () => {
    expect(CodeVerifier.safeParse('a'.repeat(42)).success).toBe(false);
    expect(CodeVerifier.safeParse('a'.repeat(128)).success).toBe(true);
    expect(CodeVerifier.safeParse('a'.repeat(129)).success).toBe(false);
  });

  it('rejects a short state', () => {
    expect(DesktopAuthorizeRequest.safeParse({ state: 'short', code_challenge: 'a'.repeat(43) }).success).toBe(false);
  });
});
