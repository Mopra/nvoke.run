import { describe, expect, it } from 'vitest';
import { classifyMail } from './classify.js';
import { footer, OPT_OUT_LINES, signatureFor, WHY_LINES, withFooter } from './footer.js';
import type { IncomingMail } from './types.js';

const reply = (text: string): IncomingMail => ({
  folder: 'INBOX',
  uid: 1,
  messageId: '<r@x>',
  inReplyTo: null,
  references: [],
  from: 'anna@acme.com',
  to: ['me@sender.io'],
  subject: 'Re: booking tools',
  date: new Date('2026-10-20T10:00:00Z'),
  headers: {},
  text,
  deliveryStatus: null,
});

describe('footer', () => {
  it('has at least 8 plain variants of each line, with no dashes as punctuation', () => {
    expect(WHY_LINES.length).toBeGreaterThanOrEqual(8);
    expect(OPT_OUT_LINES.length).toBeGreaterThanOrEqual(8);
    expect(new Set(WHY_LINES).size).toBe(WHY_LINES.length);
    expect(new Set(OPT_OUT_LINES.map((l) => l.text)).size).toBe(OPT_OUT_LINES.length);
    for (const line of [...WHY_LINES, ...OPT_OUT_LINES.map((l) => l.text)]) {
      expect(line, line).not.toMatch(/[\u2013\u2014]| -{1,2} |https?:|unsubscribe/i);
    }
    for (const line of WHY_LINES) expect(line).toContain('{domain}');
  });

  it('asks only for replies that classify.ts reads as an opt-out', () => {
    for (const l of OPT_OUT_LINES) {
      expect(classifyMail(reply(`${l.reply}\n\nOn Tue, 20 Oct 2026 at 10:00, Mo <me@sender.io> wrote:\n> ${l.text}`)), l.text).toEqual({ kind: 'human', optOut: true });
    }
  });

  it('picks the same lines for a lead every time and varies them across leads', () => {
    const o = { signature: '', displayName: 'Mo Pradsgaard', siteDomain: 'nvoke.run', domain: 'acme.com' };
    expect(footer({ ...o, leadKey: 'lead-1' })).toBe(footer({ ...o, leadKey: 'lead-1' }));
    const many = new Set(Array.from({ length: 40 }, (_, i) => footer({ ...o, leadKey: `lead-${i}` })));
    expect(many.size).toBeGreaterThan(15);
    const one = footer({ ...o, leadKey: 'lead-7' });
    expect(one.startsWith('Mo\nnvoke.run\n\n')).toBe(true);
    expect(one).toContain('acme.com');
    expect(one).not.toContain('{domain}');
  });

  it('signs with the mailbox signature, else the first name and the site domain', () => {
    expect(signatureFor({ signature: 'Mia\nAcme ApS', displayName: 'Mia Jensen', siteDomain: 'acme.dk' })).toBe('Mia\nAcme ApS');
    expect(signatureFor({ signature: '  ', displayName: 'Mia Jensen', siteDomain: 'Acme.dk' })).toBe('Mia\nacme.dk');
    expect(signatureFor({ signature: '', displayName: 'Mia', siteDomain: null })).toBe('Mia');
  });

  it('puts the footer under the body', () => {
    const o = { signature: 'Mo\nnvoke', displayName: 'Mo', domain: 'acme.com', leadKey: 'x', unsubscribeUrl: 'https://x/u/t' };
    expect(withFooter('Hi.\n\n', o)).toBe(`Hi.\n\n${footer(o)}`);
    expect(footer(o)).toMatch(/^Mo\nnvoke\n\n.+acme\.com.+\S$/s);
  });
});
