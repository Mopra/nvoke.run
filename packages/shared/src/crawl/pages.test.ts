import { describe, expect, it } from 'vitest';
import { fallbackPages, isPeoplePage, looksJsOnly, pageWall, pickFromSitemap, pickLikelyPages, planPages } from './pages.ts';

const filler = `<p>${'We are a small studio in Aarhus making furniture by hand. '.repeat(20)}</p>`;

describe('looksJsOnly', () => {
  it('is true for an app shell and a noscript that asks for JavaScript', () => {
    expect(looksJsOnly('<html><body><div id="root"></div><script src="/main.js"></script></body></html>')).toBe(true);
    expect(looksJsOnly(`<body><noscript>You need to enable JavaScript to run this app.</noscript>${filler}</body>`)).toBe(true);
  });

  it('is false for a page with real text, or without scripts', () => {
    expect(looksJsOnly(`<body>${filler}<script src="/a.js"></script></body>`)).toBe(false);
    expect(looksJsOnly('<body><p>Hi</p></body>')).toBe(false);
  });
});

describe('pageWall', () => {
  it('spots bot interstitials', () => {
    expect(pageWall('<html><head><title>Just a moment...</title></head><body></body></html>')).toBe('challenge');
    expect(pageWall('<script src="https://geo.captcha-delivery.com/captcha/"></script>')).toBe('challenge');
  });

  it('spots a bare CAPTCHA or login page, but not a full page with a form', () => {
    expect(pageWall('<body><div class="g-recaptcha"></div><p>Prove you are human</p></body>')).toBe('challenge');
    expect(pageWall('<body><form><input type="password" name="pw"></form><p>Sign in</p></body>')).toBe('login');
    expect(pageWall(`<body>${filler}<form><div class="g-recaptcha"></div></form></body>`)).toBeNull();
    expect(pageWall(`<body>${filler}<input type=password></body>`)).toBeNull();
    expect(pageWall(`<body>${filler}</body>`)).toBeNull();
  });
});

describe('pickLikelyPages', () => {
  it('reads contact paths in more languages', () => {
    const html = `<body>
      <a href="/nous-contacter">Nous contacter</a>
      <a href="/over-ons">Over ons</a>
      <a href="/ota-yhteytta">Ota yhteyttä</a>
      <a href="/shop">Shop</a>
    </body>`;
    expect(pickLikelyPages(html, 'https://acme.fr/', 5)).toEqual([
      'https://acme.fr/nous-contacter',
      'https://acme.fr/ota-yhteytta',
      'https://acme.fr/over-ons',
    ]);
  });

  it('ranks a footer link above the same kind of link in the body', () => {
    const html = `<body><p><a href="/about-the-founder">About the founder</a></p>
      <div class="site-footer"><a href="/about">About</a></div></body>`;
    expect(pickLikelyPages(html, 'https://acme.dk/', 2)[0]).toBe('https://acme.dk/about');
  });

  it('picks a vCard link', () => {
    expect(pickLikelyPages('<a href="/files/acme.vcf">Save contact</a>', 'https://acme.dk/', 2)).toEqual(['https://acme.dk/files/acme.vcf']);
  });
});

describe('planPages', () => {
  it('adds likely sitemap pages after the linked ones', () => {
    const html = '<a href="/kontakt">Kontakt</a>';
    const sitemap = ['https://acme.dk/', 'https://acme.dk/produkter', 'https://acme.dk/om-os', 'https://acme.dk/kontakt'];
    expect(planPages(html, 'https://acme.dk/', sitemap, 7)).toEqual(['https://acme.dk/kontakt', 'https://acme.dk/om-os']);
  });

  it('guesses paths when neither the links nor the sitemap help', () => {
    expect(planPages('<p>hi</p>', 'https://acme.dk/', [], 7)).toEqual([
      'https://acme.dk/contact',
      'https://acme.dk/kontakt',
      'https://acme.dk/about',
    ]);
  });
});

describe('pickFromSitemap and fallbackPages', () => {
  it('scores sitemap pages like links, shallow first', () => {
    expect(pickFromSitemap(['https://a.dk/blog/2020/contact-tips', 'https://a.dk/contact', 'https://a.dk/x.pdf'], 5)).toEqual([
      'https://a.dk/contact',
      'https://a.dk/blog/2020/contact-tips',
    ]);
  });

  it('skips posts whose long slug mentions contact', () => {
    expect(pickFromSitemap(['https://a.dk/quest/fellow-users-contact-coinbase-support-32f72c7f-f366-4bb3', 'https://a.dk/kontakt'], 5)).toEqual([
      'https://a.dk/kontakt',
    ]);
  });

  it('skips guessed paths already read', () => {
    const seen = new Set(['https://a.dk/contact', 'https://a.dk/kontakt/']);
    expect(fallbackPages('https://a.dk/', seen, 2)).toEqual(['https://a.dk/about', 'https://a.dk/impressum']);
  });
});

describe('people pages', () => {
  it('knows team, leadership, about and imprint pages from their path', () => {
    for (const url of ['https://a.dk/team', 'https://a.dk/om-os/medarbejdere', 'https://a.de/impressum', 'https://a.com/company/leadership', 'https://a.com/about-us', 'https://a.dk/ledelse']) {
      expect(isPeoplePage(url), url).toBe(true);
    }
    for (const url of ['https://a.dk/kontakt', 'https://a.com/services/asset-management', 'https://a.com/privacy', 'https://a.com/partners']) {
      expect(isPeoplePage(url), url).toBe(false);
    }
  });

  it('keeps room for people pages when contact pages alone would fill the plan', () => {
    const contacts = Array.from({ length: 8 }, (_, i) => `<a href="/kontakt-${i}">Kontakt</a>`).join('');
    const html = `<body>${contacts}<a href="/team">Team</a><a href="/impressum">Impressum</a><a href="/about">About</a><a href="/privacy">Privacy</a></body>`;
    const picked = pickLikelyPages(html, 'https://acme.de/', 6);
    expect(picked).toHaveLength(6);
    expect(picked).toEqual(expect.arrayContaining(['https://acme.de/team', 'https://acme.de/impressum', 'https://acme.de/about']));
    expect(picked[0]).toBe('https://acme.de/kontakt-0');
  });
});
