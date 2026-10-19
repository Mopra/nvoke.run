import type { Metadata } from 'next';
import Link from 'next/link';
import { Container } from '@/components/site/section';
import { EmailExtractor } from '@/components/site/tools/email-extractor';
import { ToolPage, type ToolFaq, type ToolStep, type ToolTerm } from '@/components/site/tools/tool-page';
import { toolOpenGraph } from '@/lib/tools';

const title = 'Website email extractor';
const description =
  'Find the email addresses a company publishes on its own website. nvoke reads up to eight pages, respects robots.txt and lists what it finds. Free, no sign-up.';

export const metadata: Metadata = {
  title: 'Website email extractor: find emails on any company website',
  description,
  alternates: { canonical: '/tools/website-email-extractor' },
  openGraph: toolOpenGraph('Website email extractor', description, '/tools/website-email-extractor'),
};

const STEPS: ToolStep[] = [
  {
    title: 'robots.txt first',
    body: 'Read before anything else. If it says keep out, we keep out and tell you.',
  },
  {
    title: 'Up to eight pages',
    body: 'The home page, then contact, about, team, imprint and privacy. One request a second.',
  },
  {
    title: 'Only the company’s own addresses',
    body: 'Addresses on the site’s own domain, even "name [at] domain [dot] com". No Gmail, no strangers.',
  },
];

const TERMS: ToolTerm[] = [
  {
    term: 'Role address',
    meaning: 'A shared inbox like info@, sales@ or hello@. The free tool shows these.',
  },
  {
    term: 'Address of a person',
    meaning:
      'Like jane@ or j.smith@. We count them here and show them after you sign up, checked with the mail server.',
  },
  {
    term: 'Blocked by robots.txt',
    meaning: 'The site asked crawlers like nvokebot to stay out. We do not read it.',
  },
  {
    term: 'Refuses servers',
    meaning:
      'The site turns away requests from data centers. nvoke Desktop reads it from your own computer instead.',
  },
  {
    term: 'JavaScript only',
    meaning:
      'A single page app with an empty HTML shell. nvoke Desktop renders it the way your browser does, then reads it.',
  },
  {
    term: 'Opted out',
    meaning: 'The domain asked nvoke not to collect it. We honour that everywhere, including here.',
  },
];

const FAQ: ToolFaq[] = [
  {
    q: 'Where do the addresses come from?',
    a: 'Only from the website you enter. We do not guess addresses from name patterns and we do not buy lists. If the site does not publish an address, we do not have one.',
  },
  {
    q: 'Why do I only see info@ and sales@?',
    a: 'The free tool shows role addresses only. Addresses of people are personal data, so we show them to signed-in users, checked, with the page they came from.',
  },
  {
    q: 'Why does it take up to 25 seconds?',
    a: 'We read at most one page a second, so we never hammer anyone’s server. Eight pages and a slow site add up. A site read in the last weeks answers at once.',
  },
  {
    q: 'The site says refused or JavaScript only. Now what?',
    a: 'Some sites block servers or render everything in the browser. nvoke Desktop reads those from your own computer, the way you would visit them. Same account, same plan.',
  },
  {
    q: 'I own a site. How do I keep nvoke off it?',
    a: 'Add "User-agent: nvokebot" and "Disallow: /" to your robots.txt, or opt out your domain on nvoke.run/opt-out. Both take effect immediately.',
  },
];

export default function WebsiteEmailExtractorPage() {
  return (
    <ToolPage
      slug="website-email-extractor"
      title={title}
      intro="Enter a company’s domain. We read its site the polite way and list the addresses it publishes."
      widget={<EmailExtractor />}
      stepsIntro="A careful crawler, not a scraper."
      steps={STEPS}
      termsTitle="What the results mean"
      terms={TERMS}
      faq={FAQ}
    >
      <section aria-label="The crawler" className="py-8">
        <Container>
          <p className="mx-auto max-w-xl text-center text-[15px] text-pretty text-muted-foreground">
            The crawler is nvokebot. Its rules are on the{' '}
            <Link href="/bot" className="text-foreground underline underline-offset-4">
              nvokebot page
            </Link>
            . Site owners{' '}
            <Link href="/opt-out" className="text-foreground underline underline-offset-4">
              opt out
            </Link>{' '}
            in one step.
          </p>
        </Container>
      </section>
    </ToolPage>
  );
}
