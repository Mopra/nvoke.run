import { describe, expect, it } from 'vitest';
import { looksJsOnly, pageWall } from './pages.ts';

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
