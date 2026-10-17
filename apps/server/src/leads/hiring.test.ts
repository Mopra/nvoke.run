import { describe, expect, it } from 'vitest';
import { fakeFetch } from '../testing/fakes.js';
import {
  atsFor,
  domainMatches,
  guessWebsite,
  hiringQuery,
  hiringSnippet,
  impliesSalesTeams,
  isAtsDomain,
  isSalesRole,
  parseAtsUrl,
  pickWebsite,
  postingFromResult,
  resolvePosting,
  splitPostingTitle,
} from './hiring.js';
import { RateLimiter } from './limits.js';
import { listPageDeps } from './listicle.js';

const deps = (routes: Parameters<typeof fakeFetch>[0]) => listPageDeps(new RateLimiter(0), fakeFetch(routes));

describe('parseAtsUrl', () => {
  it('knows every board and its slug', () => {
    expect(parseAtsUrl('https://jobs.lever.co/acme/f336-04e3')).toMatchObject({ ats: 'lever', slug: 'acme', board: 'https://jobs.lever.co/acme' });
    expect(parseAtsUrl('https://boards.greenhouse.io/acme/jobs/123')).toMatchObject({ ats: 'greenhouse', slug: 'acme', board: 'https://job-boards.greenhouse.io/acme' });
    expect(parseAtsUrl('https://job-boards.greenhouse.io/acme/jobs/123')?.ats).toBe('greenhouse');
    expect(parseAtsUrl('https://jobs.ashbyhq.com/acme/8c00-4352/application')).toMatchObject({ ats: 'ashby', slug: 'acme' });
    expect(parseAtsUrl('https://apply.workable.com/acme/j/E2B6FEDB37')).toMatchObject({ ats: 'workable', board: 'https://apply.workable.com/acme/' });
    expect(parseAtsUrl('https://acme-gmbh.jobs.personio.de/job/2745283?language=en')).toMatchObject({ ats: 'personio', slug: 'acme-gmbh', board: 'https://acme-gmbh.jobs.personio.de/' });
    expect(parseAtsUrl('https://acme.na.teamtailor.com/jobs/649280-sdr')).toMatchObject({ ats: 'teamtailor', slug: 'acme', board: 'https://acme.na.teamtailor.com/' });
    expect(parseAtsUrl('https://acme.recruitee.com/o/account-executive')).toMatchObject({ ats: 'recruitee', slug: 'acme' });
  });

  it('refuses other hosts and the systems own pages', () => {
    expect(parseAtsUrl('https://acme.com/careers')).toBeNull();
    expect(parseAtsUrl('https://www.teamtailor.com/en/')).toBeNull();
    expect(parseAtsUrl('https://boards.greenhouse.io/embed/job_board')).toBeNull();
    expect(parseAtsUrl('not a url')).toBeNull();
    expect(isAtsDomain('job-boards.greenhouse.io')).toBe(true);
    expect(isAtsDomain('greenhouse.com')).toBe(true);
    expect(isAtsDomain('acme.com')).toBe(false);
  });
});

describe('postings', () => {
  it('splits each system title into role and company', () => {
    expect(splitPostingTitle('lever', 'Promenade - Sales Development Representative')).toEqual({ role: 'Sales Development Representative', company: 'Promenade' });
    expect(splitPostingTitle('greenhouse', 'Job Application for Sales Development Representative at Gong.io')).toEqual({ role: 'Sales Development Representative', company: 'Gong.io' });
    expect(splitPostingTitle('ashby', 'Founding Account Executive @ Lightfield')).toEqual({ role: 'Founding Account Executive', company: 'Lightfield' });
    expect(splitPostingTitle('personio', 'Sales Development Representative (m/w/d) | Jobs bei Workist')).toEqual({ role: 'Sales Development Representative (m/w/d)', company: 'Workist' });
    expect(splitPostingTitle('teamtailor', 'Sales Development Representative - Chapter 2 - Teamtailor')).toEqual({ role: 'Sales Development Representative', company: 'Chapter 2' });
    expect(splitPostingTitle('workable', 'Business Development Representative - SaaS / Tech - Huzzle')).toEqual({ role: 'Business Development Representative - SaaS / Tech', company: 'Huzzle' });
  });

  it('takes sales roles only', () => {
    expect(isSalesRole('Founding Account Executive')).toBe(true);
    expect(isSalesRole('SDR (m/w/d)')).toBe(true);
    expect(isSalesRole('Vertriebsmitarbeiter Innendienst')).toBe(true);
    expect(isSalesRole('Brand Designer')).toBe(false);
    expect(isSalesRole('Commercial Counsel')).toBe(false);
    expect(postingFromResult('https://jobs.lever.co/acme/1', 'Acme - Senior Backend Engineer')).toBeNull();
    expect(postingFromResult('https://acme.com/jobs/1', 'Acme - Account Executive')).toBeNull();
    expect(postingFromResult('https://jobs.ashbyhq.com/exa/9331', 'Account Executive @ Exa')).toMatchObject({
      ats: 'ashby',
      slug: 'exa',
      role: 'Account Executive',
      company: 'Exa',
      url: 'https://jobs.ashbyhq.com/exa/9331',
    });
  });
});

describe('queries', () => {
  it('ORs the boards a country uses into one query', () => {
    expect(hiringQuery('account executive', ['lever', 'ashby'])).toBe('"account executive" (site:jobs.lever.co OR site:jobs.ashbyhq.com)');
    expect(atsFor('de')[0]).toBe('personio');
    expect(atsFor('se')[0]).toBe('teamtailor');
    expect(atsFor(undefined)).toEqual(['lever', 'greenhouse', 'ashby', 'workable']);
  });

  it('knows when a description names sales teams or outbound', () => {
    expect(impliesSalesTeams('Founders of B2B companies and small sales teams')).toBe(true);
    expect(impliesSalesTeams('SDRs at B2B SaaS companies')).toBe(true);
    expect(impliesSalesTeams('Agencies that run cold email for clients')).toBe(false);
    expect(impliesSalesTeams('Outbound agencies')).toBe(false);
    expect(impliesSalesTeams('Dentists in Aarhus')).toBe(false);
    expect(impliesSalesTeams('Wedding photographers')).toBe(false);
  });
});

describe('pickWebsite', () => {
  it('takes the logo or home page link, never the system, a tracker or a review site', () => {
    const html = `<html><body>
      <a href="https://www.greenhouse.com"><img src="gh.svg"></a>
      <a href="https://jobs.lever.co/acme">Jobs</a>
      <a href="https://www.glassdoor.nl/acme">Glassdoor</a>
      <a href="https://linkedin.com/company/acme">LinkedIn</a>
      <a href="https://cookiepartner.com/privacy">Privacy policy</a>
      <footer><a href="https://www.acme.io/">Acme Home Page</a></footer>
    </body></html>`;
    expect(pickWebsite(html, 'https://jobs.lever.co/acme', ['acme'])).toBe('https://acme.io');
  });

  it('gives up on a lone link that does not look like the company', () => {
    expect(pickWebsite('<a href="https://partner.com/x">Partner</a>', 'https://acme.teamtailor.com/', ['acme'])).toBeNull();
    expect(pickWebsite('<p>no links</p>', 'https://acme.teamtailor.com/', ['acme'])).toBeNull();
  });

  it('matches names to domains loosely', () => {
    expect(domainMatches('thehive.ai', ['hive'])).toBe(true);
    expect(domainMatches('getpromenade.com', ['Promenade'])).toBe(true);
    expect(domainMatches('checkmk.com', ['checkmk-gmbh'])).toBe(true);
    expect(domainMatches('speedkit.com', ['baqend'])).toBe(false);
  });
});

describe('resolvePosting', () => {
  const posting = (url: string, title: string) => postingFromResult(url, title)!;

  it('reads Ashby page data for the site and the open roles', async () => {
    const data = { organization: { name: 'Exa', publicWebsite: 'https://exa.ai/' }, jobBoard: { jobPostings: [{ title: 'Account Executive' }, { title: 'Designer' }] } };
    const d = deps({
      'https://jobs.ashbyhq.com/robots.txt': { body: 'User-Agent: *\nDisallow: /api/' },
      'https://jobs.ashbyhq.com/exa': { body: `<html><script>window.__appData = ${JSON.stringify(data)};</script></html>` },
    });
    const found = await resolvePosting(posting('https://jobs.ashbyhq.com/exa/1', 'Account Executive @ Exa'), d);
    expect(found).toMatchObject({ name: 'Exa', website: 'https://exa.ai', board: { jobs: 2, salesRoles: ['Account Executive'] } });
    expect(hiringSnippet(found!)).toBe('Job post on Ashby: "Account Executive". Open sales roles on its board: Account Executive. 2 open roles in all.');
  });

  it('reads the Workable account for the site', async () => {
    const d = deps({
      'https://apply.workable.com/robots.txt': { body: 'User-agent: *\nDisallow:' },
      'https://apply.workable.com/api/v1/accounts/measured': { body: JSON.stringify({ name: 'Measured', url: 'https://www.measured.com/' }), headers: { 'content-type': 'application/json' } },
    });
    const found = await resolvePosting(posting('https://apply.workable.com/measured/j/9DA39F141E', 'Business Development Representative - Measured'), d);
    expect(found).toMatchObject({ name: 'Measured', website: 'https://measured.com' });
  });

  it('takes the company site from Greenhouse postings on its own careers page, a careers host standing for the site', async () => {
    const jobs = { jobs: [{ title: 'Sales Development Representative', company_name: 'Bloomreach', absolute_url: 'https://careers.bloomreach.com/jobs?gh_jid=1' }] };
    const d = deps({
      'https://boards-api.greenhouse.io/robots.txt': { body: '' },
      'https://boards-api.greenhouse.io/v1/boards/bloomreach/jobs': { body: JSON.stringify(jobs), headers: { 'content-type': 'application/json' } },
    });
    const found = await resolvePosting(posting('https://job-boards.greenhouse.io/bloomreach/jobs/1', 'Job Application for Sales Development Representative at Bloomreach'), d);
    expect(found).toMatchObject({ name: 'Bloomreach', website: 'https://bloomreach.com', board: { jobs: 1 } });
  });

  it('counts the open roles on a Lever board and finds the home page link', async () => {
    const d = deps({
      'https://jobs.lever.co/robots.txt': { body: 'User-agent: *\nAllow: /' },
      'https://jobs.lever.co/belkins': {
        body: `<html><body>
          <a class="posting-btn-submit" href="https://jobs.lever.co/belkins/0f1e2d3c-4b5a-6978-8091-a2b3c4d5e6f7">Apply</a>
          <a class="posting-title" href="https://jobs.lever.co/belkins/0f1e2d3c-4b5a-6978-8091-a2b3c4d5e6f7"><h5 data-qa="posting-name">Sales Development Representative</h5></a>
          <a class="posting-title" href="https://jobs.lever.co/belkins/1f1e2d3c-4b5a-6978-8091-a2b3c4d5e6f7"><h5>Designer</h5></a>
          <a href="https://belkins.io/">Belkins Home Page</a></body></html>`,
      },
    });
    const found = await resolvePosting(posting('https://jobs.lever.co/belkins/0f1e', 'Belkins - Sales Development Representative'), d);
    expect(found).toMatchObject({ name: 'Belkins', website: 'https://belkins.io', board: { jobs: 2, salesRoles: ['Sales Development Representative'] } });
  });

  it('guesses from the board name when the board does not say, and keeps the guess only when the homepage names the company', async () => {
    const d = deps({
      'https://job-boards.greenhouse.io/tailscale': { body: '<a href="https://www.greenhouse.com"><img></a>' },
      'https://tailscale.com/': { body: '<title>Tailscale | Secure connectivity</title>' },
    });
    const found = await resolvePosting(posting('https://job-boards.greenhouse.io/tailscale/jobs/1', 'Job Application for Sales Development Representative at Tailscale'), d);
    expect(found).toMatchObject({ website: 'https://tailscale.com', guessed: true });
    expect(hiringSnippet(found!)).toContain('matched to the job board by name, not by a link');

    // A short name is anyone's: its homepage must link back to the board.
    const pilot = deps({ 'https://pilot.com/': { body: '<title>Pilot | Bookkeeping</title>' } });
    expect(await guessWebsite('Pilot', 'pilot', pilot, undefined, 'https://jobs.lever.co/pilot')).toBeNull();
    const linked = deps({ 'https://pilot.com/': { body: '<title>Pilot</title><a href="https://jobs.lever.co/pilot">Careers</a>' } });
    expect(await guessWebsite('Pilot', 'pilot', linked, undefined, 'https://jobs.lever.co/pilot')).toBe('https://pilot.com');
    // A longer name must be the domain's label exactly, not a part of it.
    const near = deps({ 'https://novacorp.com/': { body: '<title>Novacorp</title>' } });
    expect(await guessWebsite('Novacorp Labs', 'novacorp', near)).toBeNull();

    const wrong = deps({ 'https://nobody.com/': { body: '<title>Domain for sale</title>' } });
    expect(await guessWebsite('Nobody', 'nobody', wrong)).toBeNull();
    expect(await resolvePosting(posting('https://jobs.lever.co/nobody/1', 'Nobody - Account Executive'), wrong)).toBeNull();
  });
});
