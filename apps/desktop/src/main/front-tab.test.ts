import { describe, expect, it } from 'vitest';
import { isAutomationDenied, macBrowser, parseWindowsHelper, tabDomain, windowsBrowser } from './front-tab';

describe('tabDomain', () => {
  it('reads what address bars show, with or without a scheme', () => {
    expect(tabDomain('https://www.acme.com/contact?x=1')).toBe('acme.com');
    expect(tabDomain('acme.com/about')).toBe('acme.com');
    expect(tabDomain('shop.acme.co.uk')).toBe('shop.acme.co.uk');
    expect(tabDomain('acme.com:8080/x')).toBe('acme.com');
    expect(tabDomain('medium.com/@jane')).toBe('medium.com');
  });

  it('ignores browser pages, files, searches and empty bars', () => {
    expect(tabDomain('')).toBeNull();
    expect(tabDomain('chrome://settings')).toBeNull();
    expect(tabDomain('edge://newtab/')).toBeNull();
    expect(tabDomain('about:blank')).toBeNull();
    expect(tabDomain('file:///C:/report.pdf')).toBeNull();
    expect(tabDomain('mailto:jane@acme.com')).toBeNull();
    expect(tabDomain('dentists in aarhus')).toBeNull();
  });
});

describe('parseWindowsHelper', () => {
  it('turns the helper line into a tab', () => {
    expect(parseWindowsHelper('{"process":"chrome","url":"youtube.com/watch?v=1"}\r\n')).toEqual({
      status: 'read',
      browser: 'Chrome',
      domain: 'youtube.com',
    });
    expect(parseWindowsHelper('{"process":"msedge","url":"https://example.com/hello"}')).toEqual({
      status: 'read',
      browser: 'Edge',
      domain: 'example.com',
    });
  });

  it('gives null for no output, other apps and pages that are not sites', () => {
    expect(parseWindowsHelper('')).toBeNull();
    expect(parseWindowsHelper('not json')).toBeNull();
    expect(parseWindowsHelper('{"process":"notepad","url":"acme.com"}')).toBeNull();
    expect(parseWindowsHelper('{"process":"chrome","url":"chrome://newtab"}')).toBeNull();
    expect(parseWindowsHelper('{"process":"chrome"}')).toBeNull();
  });
});

describe('browsers', () => {
  it('knows the browsers it reads on each platform', () => {
    expect(['chrome', 'MSEDGE', 'firefox', 'brave'].map(windowsBrowser)).toEqual(['Chrome', 'Edge', 'Firefox', 'Brave']);
    expect(windowsBrowser('opera')).toBeNull();
    expect(['Safari', 'Google Chrome', 'Arc'].map(macBrowser)).toEqual(['Safari', 'Chrome', 'Arc']);
    expect(macBrowser('Finder')).toBeNull();
  });

  it('spots a refused Automation permission', () => {
    expect(isAutomationDenied('execution error: Not authorized to send Apple events to Safari. (-1743)')).toBe(true);
    expect(isAutomationDenied('execution error: Can’t get front document. (-1728)')).toBe(false);
  });
});
