import { describe, expect, it } from 'vitest';
import { checkEmailAuth, type AuthDns } from './email-auth.js';
import { publicOnlyFetch, workerProbesPerMinute } from './deps.js';

function dns(txt: Record<string, string[]>): AuthDns {
  return {
    resolveMx: async () => [{ exchange: 'mx.example.dk', priority: 10 }],
    resolve4: async () => [],
    resolve6: async () => [],
    resolveTxt: async (name) => {
      const records = txt[name];
      if (!records) throw Object.assign(new Error('nodata'), { code: 'ENODATA' });
      return records.map((r) => [r]);
    },
  };
}

describe('checkEmailAuth', () => {
  it('fails +all and more than one SPF record', async () => {
    const res = await checkEmailAuth('x.dk', dns({ 'x.dk': ['v=spf1 +all', 'v=spf1 -all'] }));
    expect(res.spf.grade).toBe('fail');
    expect(res.spf.all).toBe('+all');
    expect(res.spf.notes.join(' ')).toMatch(/exactly one/);
  });

  it('counts lookups through nested includes and fails past 10', async () => {
    const res = await checkEmailAuth(
      'x.dk',
      dns({
        'x.dk': ['v=spf1 include:a.dk include:b.dk ~all'],
        'a.dk': ['v=spf1 a mx include:c.dk -all'],
        'b.dk': ['v=spf1 a mx exists:%{i}.x.dk -all'],
        'c.dk': ['v=spf1 a mx a:one.dk a:two.dk -all'],
      }),
    );
    expect(res.spf.lookups).toBe(12);
    expect(res.spf.grade).toBe('fail');
  });

  it('survives an include loop', async () => {
    const res = await checkEmailAuth('x.dk', dns({ 'x.dk': ['v=spf1 include:y.dk -all'], 'y.dk': ['v=spf1 include:x.dk -all'] }));
    expect(res.spf.lookups).toBe(2);
  });

  it('warns on p=none and a partial pct', async () => {
    expect((await checkEmailAuth('x.dk', dns({ '_dmarc.x.dk': ['v=DMARC1; p=none'] }))).dmarc).toMatchObject({ grade: 'warn', policy: 'none' });
    expect(
      (await checkEmailAuth('x.dk', dns({ '_dmarc.x.dk': ['v=DMARC1; p=quarantine; pct=20; rua=mailto:a@x.dk'] }))).dmarc,
    ).toMatchObject({ grade: 'warn', policy: 'quarantine' });
  });

  it('fails a DMARC record without a valid policy', async () => {
    expect((await checkEmailAuth('x.dk', dns({ '_dmarc.x.dk': ['v=DMARC1; rua=mailto:a@x.dk'] }))).dmarc).toMatchObject({
      grade: 'fail',
      policy: null,
    });
  });
});

describe('workerProbesPerMinute', () => {
  it('takes the tools share off the worker budget', () => {
    expect(workerProbesPerMinute({ SMTP_PROBES_PER_MINUTE: 5, TOOLS_SMTP_PROBES_PER_MINUTE: 1 })).toBe(4);
    expect(workerProbesPerMinute({ SMTP_PROBES_PER_MINUTE: 1, TOOLS_SMTP_PROBES_PER_MINUTE: 3 })).toBe(1);
    expect(workerProbesPerMinute({ SMTP_PROBES_PER_MINUTE: 0, TOOLS_SMTP_PROBES_PER_MINUTE: 1 })).toBe(0);
  });
});

describe('publicOnlyFetch', () => {
  it('refuses private hosts before fetching', async () => {
    let called = false;
    const f = publicOnlyFetch(async () => {
      called = true;
      return new Response('');
    });
    await expect(f('http://127.0.0.1/robots.txt')).rejects.toThrow(/private address/);
    await expect(f('http://[::1]/')).rejects.toThrow(/private address/);
    expect(called).toBe(false);
  });
});
