import { describe, expect, it } from 'vitest';
import { fixture } from '../testing/fakes.js';
import {
  acceptAddress,
  classifyAddress,
  decodeCfEmail,
  deobfuscate,
  extractCandidates,
  extractEmails,
  normalizeEmail,
  rejectReason,
  selectForCompany,
  type ExtractedEmail,
} from './extract.js';

const addresses = (html: string, url: string | null = null) => extractEmails(html, url).map((e) => e.address);

function cf(email: string, key = 0x42): string {
  let hex = key.toString(16).padStart(2, '0');
  for (const byte of Buffer.from(email, 'utf8')) hex += (byte ^ key).toString(16).padStart(2, '0');
  return hex;
}

describe('normalizeEmail', () => {
  it('lowercases and peels mailto, brackets and queries', () => {
    expect(normalizeEmail(' Info@Acme.DK ')).toBe('info@acme.dk');
    expect(normalizeEmail('mailto:hello@acme.dk?subject=Hi')).toBe('hello@acme.dk');
    expect(normalizeEmail('<sales@acme.dk>')).toBe('sales@acme.dk');
    expect(normalizeEmail('info@acme.dk.')).toBe('info@acme.dk');
    expect(normalizeEmail('...info@acme.dk')).toBe('info@acme.dk');
  });

  it('keeps a +tag, because that is what the business published', () => {
    expect(normalizeEmail('orders+web@acme.dk')).toBe('orders+web@acme.dk');
  });

  it('rejects malformed addresses', () => {
    for (const bad of ['', 'no-at-sign', 'a@b', 'a@@b.dk', 'a..b@c.dk', 'a@-b.dk', 'a@b.d', 'a@b.123', 'a b@c.dk', 'a@b..dk']) {
      expect(normalizeEmail(bad), bad).toBeNull();
    }
  });
});

describe('rejectReason and acceptAddress', () => {
  it.each([
    ['logo@2x.png', 'asset file name'],
    ['hero@3x.webp', 'asset file name'],
    ['icon-sprite@2x.svg', 'asset file name'],
    ['bundle@1.2.3.js', 'asset file name'],
    ['name@example.com', 'placeholder domain'],
    ['john@domain.com', 'placeholder domain'],
    ['your@email.com', 'placeholder domain'],
    ['info@yourdomain.com', 'placeholder domain'],
    ['dig@firma.dk', 'placeholder domain'],
    ['hej@site.test', 'placeholder domain'],
    ['yourname@acme.dk', 'placeholder local part'],
    ['john.doe@acme.dk', 'placeholder local part'],
    ['abc123@o42.ingest.sentry.io', 'platform address'],
    ['5f2b9d@sentry-next.wixpress.com', 'platform address'],
    ['support@wix.com', 'platform address'],
    ['noreply@acme.dk', 'no-reply mailbox'],
    ['no-reply@acme.dk', 'no-reply mailbox'],
    ['donotreply@acme.dk', 'no-reply mailbox'],
    ['mailer-daemon@acme.dk', 'no-reply mailbox'],
    ['3f9a8e7d6c5b4a39@acme.dk', 'hex token'],
    ['a1b2c3d4@acme.dk', 'hex token'],
    ['84720193@acme.dk', 'all digits'],
  ])('refuses %s (%s)', (address, reason) => {
    expect(rejectReason(address)).toBe(reason);
    expect(acceptAddress(address)).toBeNull();
  });

  it.each(['info@acme.dk', 'kontakt@tandlaege-nord.dk', 'mette.hansen@acme.dk', 'jd1990@gmail.com', 'facade@acme.dk', 'deadbeef@acme.dk', 'support@acme.io', 'info@acme.co.uk'])(
    'accepts %s',
    (address) => {
      expect(acceptAddress(address)).toBe(address);
    },
  );
});

describe('classifyAddress', () => {
  it.each([
    ['info@acme.dk', 'generic'],
    ['kontakt@acme.dk', 'generic'],
    ['hello@acme.io', 'generic'],
    ['booking@acme.dk', 'generic'],
    ['kundeservice@acme.dk', 'generic'],
    ['info.cph@acme.dk', 'generic'],
    ['sales-team@acme.dk', 'generic'],
    ['regnskab@acme.dk', 'generic'],
    ['newbusiness@acme.co.uk', 'generic'],
    ['data@acme.com', 'generic'],
    ['datacontroller@acme.com', 'generic'],
    ['backoffice@acme.com', 'generic'],
    ['agencenova@agencenova.com', 'generic'],
    ['agence.nova@agence-nova.com', 'generic'],
    ['mette@acme.dk', 'personal'],
    ['mette.hansen@acme.dk', 'personal'],
    ['mh@acme.dk', 'personal'],
    ['lars+web@acme.dk', 'personal'],
    // Webmail is somebody's own mailbox, whatever the local part says.
    ['info@gmail.com', 'personal'],
    ['kontakt@mail.dk', 'personal'],
    ['info@hotmail.co.uk', 'personal'],
    ['salg@jubii.dk', 'personal'],
  ] as const)('%s is %s', (address, kind) => {
    expect(classifyAddress(address)).toBe(kind);
  });
});

describe('deobfuscate', () => {
  it.each([
    ['priya [at] meterbase [dot] dev', 'priya@meterbase.dev'],
    ['priya (at) meterbase (dot) dev', 'priya@meterbase.dev'],
    ['priya {at} meterbase {dot} dev', 'priya@meterbase.dev'],
    ['priya<at>meterbase<dot>dev', 'priya@meterbase.dev'],
    ['priya [@] meterbase [.] dev', 'priya@meterbase.dev'],
    ['priya AT meterbase DOT dev', 'priya@meterbase.dev'],
    ['write to priya at meterbase dot dev today', 'priya@meterbase.dev'],
    ['priya at mail dot meterbase dot co dot uk', 'priya@mail.meterbase.co.uk'],
    ['info(snabel-a)firma-nord.dk', 'info@firma-nord.dk'],
    ['info (snabela) firma-nord (punktum) dk', 'info@firma-nord.dk'],
    ['kontakt(ät)beispiel-gmbh(punkt)de', 'kontakt@beispiel-gmbh.de'],
    ['info [arroba] empresa [punto] es', 'info@empresa.es'],
    ['priya&#64;meterbase&#46;dev', 'priya@meterbase.dev'],
    ['priya&#x40;meterbase&period;dev', 'priya@meterbase.dev'],
    ['priya&commat;meterbase.dev', 'priya@meterbase.dev'],
    ['priya @ meterbase.dev', 'priya@meterbase.dev'],
    ['priya@ meterbase.dev', 'priya@meterbase.dev'],
    ['priya \\u0040meterbase.dev', 'priya@meterbase.dev'],
  ])('%s', (input, expected) => {
    expect(deobfuscate(input)).toContain(expected);
  });

  it('leaves ordinary prose alone', () => {
    for (const prose of ['Look at this and then at that.', 'We met at the cafe at noon, then went home.', 'Option (a) is best.']) {
      expect(extractCandidates(`<p>${prose}</p>`)).toEqual([]);
    }
  });
});

describe('decodeCfEmail', () => {
  it('decodes Cloudflare email protection', () => {
    expect(decodeCfEmail(cf('info@acme.dk'))).toBe('info@acme.dk');
    expect(decodeCfEmail(cf('søren@acme.dk', 0x13))).toBe('søren@acme.dk');
    expect(decodeCfEmail('zz')).toBeNull();
    expect(decodeCfEmail('abc')).toBeNull();
  });
});

describe('extractEmails on HTML', () => {
  it('reads mailto links, with subjects, multiple recipients and percent escapes', () => {
    const html = `
      <a href="mailto:info@acme.dk?subject=Hello&body=Hi">Write us</a>
      <a href="MAILTO:Sales@Acme.dk">Sales</a>
      <a href="mailto:a@acme.dk,b.person@acme.dk">Both</a>
      <a href="mailto:%20mette%40acme.dk">Mette</a>`;
    expect(addresses(html).sort()).toEqual(['a@acme.dk', 'b.person@acme.dk', 'info@acme.dk', 'mette@acme.dk', 'sales@acme.dk']);
  });

  it('reads plain text addresses across tags without fusing words', () => {
    const html = '<div><p>Email</p><p>hello@acme.dk</p><table><tr><td>Phone</td><td>mette@acme.dk</td></tr></table></div>';
    expect(addresses(html).sort()).toEqual(['hello@acme.dk', 'mette@acme.dk']);
  });

  it('ignores addresses that only appear in scripts, styles and SVG, except joined strings', () => {
    const html = `
      <script>var dsn = "abc@o1.ingest.sentry.io"; var x = "someone@acme.dk";</script>
      <style>.a::after { content: "styled@acme.dk" }</style>
      <svg><text>vector@acme.dk</text></svg>
      <script>document.write('<a href="mailto:' + 'info' + '@' + 'acme.dk' + '">mail</a>')</script>`;
    expect(addresses(html)).toEqual(['info@acme.dk']);
    expect(extractEmails(html)[0]?.via).toBe('script');
  });

  it('reads Cloudflare protected addresses from links and data attributes', () => {
    const html = `
      <a href="/cdn-cgi/l/email-protection#${cf('kontakt@acme.dk')}">[email protected]</a>
      <span class="__cf_email__" data-cfemail="${cf('lars@acme.dk', 0x7a)}">[email protected]</span>`;
    const found = extractEmails(html);
    expect(found.map((e) => [e.address, e.via])).toEqual([
      ['kontakt@acme.dk', 'cfemail'],
      ['lars@acme.dk', 'cfemail'],
    ]);
  });

  it('reads JSON-LD email fields, nested and with mailto', () => {
    const html = `<script type="application/ld+json">
      [{"@type":"Organization","email":"mailto:info@acme.dk","founder":{"@type":"Person","email":"Ann@Acme.dk"}}, {"broken": }]
    </script>
    <script type="application/ld+json">{"@graph":[{"contactPoint":{"email":"support@acme.dk"}}]}</script>`;
    expect(addresses(html).sort()).toEqual(['ann@acme.dk', 'info@acme.dk', 'support@acme.dk']);
  });

  it('reads addresses in title, data-email and meta content attributes', () => {
    const html = `
      <head><meta name="contact" content="post@acme.dk"></head>
      <body><span title="Mail: ole@acme.dk">Ole</span><button data-email="booking@acme.dk">Book</button></body>`;
    expect(addresses(html).sort()).toEqual(['booking@acme.dk', 'ole@acme.dk', 'post@acme.dk']);
  });

  it('undoes JSON and URL escapes in inline text', () => {
    expect(addresses('<p>\\u003cinfo@acme.dk\\u003e and mailto%3Asales%40acme.dk</p>').sort()).toEqual(['info@acme.dk', 'sales@acme.dk']);
  });

  it('drops images, placeholders, platforms and no-reply mailboxes', () => {
    const html = `
      <img src="/img/logo@2x.png" alt="logo@2x.png">
      <p>Example: name@example.com, your@email.com, john.doe@acme.dk</p>
      <p>Powered by support@wix.com, errors to 1a2b3c4d5e6f7a8b@o99.ingest.sentry.io</p>
      <p>Do not answer noreply@acme.dk</p>
      <p>Real: info@acme.dk</p>`;
    expect(addresses(html)).toEqual(['info@acme.dk']);
  });

  it('deduplicates the same address found several ways', () => {
    const html = `<a href="mailto:info@acme.dk">info@acme.dk</a> <p>INFO@ACME.DK</p> <p>info [at] acme [dot] dk</p>`;
    expect(extractEmails(html, 'https://acme.dk/kontakt')).toEqual([
      { address: 'info@acme.dk', kind: 'generic', via: 'mailto', sourceUrl: 'https://acme.dk/kontakt' },
    ]);
  });

  it('stays linear on huge runs of letters (inline base64, minified data)', () => {
    const start = Date.now();
    const html = `<p>${'a'.repeat(1_500_000)}</p><img src="data:image/png;base64,${'Q'.repeat(400_000)}"><p>info@acme.dk</p>`;
    expect(addresses(html)).toEqual(['info@acme.dk']);
    expect(Date.now() - start).toBeLessThan(3_000);
  });

  it('survives broken markup', () => {
    expect(addresses('<div><p>Contact <b>info@acme.dk</p></div></span></html><<<')).toEqual(['info@acme.dk']);
    expect(addresses('')).toEqual([]);
    expect(addresses('just text, mail me: ole@acme.dk.')).toEqual(['ole@acme.dk']);
  });

  it('handles international domains and Danish letters around addresses', () => {
    expect(addresses('<p>Skriv til os på kontakt@xn--tandlge-hellerup-yob.dk, så svarer vi.</p>')).toEqual([
      'kontakt@xn--tandlge-hellerup-yob.dk',
    ]);
  });

  it('extracts everything from a realistic Danish clinic contact page', () => {
    const found = extractEmails(fixture('sites/dentist-kontakt.html'), 'https://tandtorvet.dk/kontakt');
    const byAddress = Object.fromEntries(found.map((e) => [e.address, e]));
    expect(Object.keys(byAddress).sort()).toEqual([
      'bogholderi@tandtorvet.dk',
      'booking@tandtorvet.dk',
      'hello@webbureauet.dk',
      'info@tandtorvet.dk',
      'klinik@tandtorvet.dk',
      'lars@tandtorvet.dk',
      'mette.hansen@tandtorvet.dk',
      'sofie@tandtorvet.dk',
    ]);
    expect(byAddress['info@tandtorvet.dk']?.kind).toBe('generic');
    expect(byAddress['mette.hansen@tandtorvet.dk']?.kind).toBe('personal');
    expect(byAddress['klinik@tandtorvet.dk']?.via).toBe('jsonld');
    expect(byAddress['booking@tandtorvet.dk']?.via).toBe('cfemail');
    expect(byAddress['lars@tandtorvet.dk']?.via).toBe('obfuscated');
  });
});

describe('selectForCompany', () => {
  const e = (address: string, via: ExtractedEmail['via'] = 'text'): ExtractedEmail => ({
    address,
    kind: classifyAddress(address),
    via,
    sourceUrl: null,
  });

  it('keeps only addresses on the company site when there are any', () => {
    const picked = selectForCompany(
      [e('info@acme.dk'), e('hello@webagency.dk'), e('ole@mail.acme.dk'), e('acme.shop@gmail.com')],
      'acme.dk',
    );
    expect(picked.map((x) => x.address)).toEqual(['info@acme.dk', 'ole@mail.acme.dk']);
  });

  it('keeps other domains when nothing is on the company site', () => {
    const picked = selectForCompany([e('acme.shop@gmail.com'), e('hello@webagency.dk')], 'acme.dk');
    expect(picked.map((x) => x.address)).toEqual(['acme.shop@gmail.com', 'hello@webagency.dk']);
  });

  it('never keeps a script-only address on another domain', () => {
    expect(selectForCompany([e('x@tracker.io', 'script')], 'acme.dk')).toEqual([]);
    expect(selectForCompany([e('info@acme.dk', 'script')], 'acme.dk')).toHaveLength(1);
  });

  it('treats several company domains as one site (a redirect to a new brand)', () => {
    const picked = selectForCompany([e('info@newbrand.com'), e('hello@agency.dk')], ['oldname.dk', 'newbrand.com']);
    expect(picked.map((x) => x.address)).toEqual(['info@newbrand.com']);
  });

  it('understands second level country domains', () => {
    const picked = selectForCompany([e('info@acme.co.uk'), e('x@other.co.uk')], 'www.acme.co.uk');
    expect(picked.map((x) => x.address)).toEqual(['info@acme.co.uk']);
  });
});

describe('more obfuscations', () => {
  it('reads (a), zero width characters and full width at signs', () => {
    expect(addresses('<p>info(a)acme.dk</p>')).toEqual(['info@acme.dk']);
    expect(addresses('<p>info​@acme­.dk</p>')).toEqual(['info@acme.dk']);
    expect(addresses('<p>info＠acme.dk</p>')).toEqual(['info@acme.dk']);
    expect(addresses('<p>biuro [at] acme [kropka] pl</p>')).toEqual(['biuro@acme.pl']);
  });

  it('leaves a sentence after an address alone', () => {
    expect(addresses('<p>Write to info@acme.dk. Next we open at nine.</p>')).toEqual(['info@acme.dk']);
    expect(addresses('<p><a href="#">info@acme.dk</a>. We answer fast.</p>')).toEqual(['info@acme.dk']);
  });

  it('joins data-user and data-domain, and reverses right to left text', () => {
    expect(addresses('<span class="mail" data-user="hej" data-domain="acme.dk"></span>')).toEqual(['hej@acme.dk']);
    expect(addresses('<span style="unicode-bidi: bidi-override; direction: rtl">kd.emca@ofni</span>')).toEqual(['info@acme.dk']);
  });

  it('reads schema.org microdata and hCard', () => {
    const html = '<div itemscope><meta itemprop="email" content="sales@acme.dk"><span class="u-email">lars [at] acme.dk</span></div>';
    expect(extractEmails(html).map((e) => [e.address, e.via])).toEqual([
      ['sales@acme.dk', 'microdata'],
      ['lars@acme.dk', 'microdata'],
    ]);
  });

  it('reads the recipients of a contact form', () => {
    const html = `<form><select name="to"><option value="registration@kennel.dk">General</option></select>
      <input type="hidden" name="recipient" value="sales@kennel.dk"><input type="email" value="you@yours.com"></form>`;
    expect(addresses(html)).toEqual(['registration@kennel.dk', 'sales@kennel.dk']);
  });

  it('reads a vCard', () => {
    expect(addresses('BEGIN:VCARD\nVERSION:3.0\nFN:Lars Hansen\nEMAIL;TYPE=work:lars@acme.dk\nEND:VCARD')).toEqual(['lars@acme.dk']);
  });
});
