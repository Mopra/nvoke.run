import { describe, expect, it } from 'vitest';
import { HealthResponse } from './api.js';

describe('HealthResponse', () => {
  it('accepts a valid payload', () => {
    const parsed = HealthResponse.parse({ status: 'ok', service: 'api', version: '0.1.0', uptimeSeconds: 1 });
    expect(parsed.status).toBe('ok');
  });

  it('rejects an unknown status', () => {
    expect(HealthResponse.safeParse({ status: 'down', service: 'api', version: '0.1.0', uptimeSeconds: 1 }).success).toBe(false);
  });
});
