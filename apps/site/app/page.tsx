import Link from 'next/link';
import { LiveSearch } from '@/components/mockups/live-search';
import { Faq, type FaqItem } from '@/components/site/faq';
import { AgentCall, ShortcutKeys } from '@/components/site/home/demos';
import { LeadCounter } from '@/components/site/home/lead-counter';
import { Pipeline } from '@/components/site/home/pipeline';
import { PriceDisplay } from '@/components/site/home/price-display';
import { RevealHeading } from '@/components/site/home/reveal';
import { Container, Eyebrow } from '@/components/site/section';
import { Button } from '@/components/ui/button';
import { formatCount, pricing } from '@/lib/pricing';

const freeEmails = formatCount(pricing.free.emailsPerMonth);

const FAQ: FaqItem[] = [
  {
    q: 'Where do the email addresses come from?',
    a: 'The company’s own website. nvoke reads a handful of pages per site, including addresses written as "name [at] domain [dot] com". No bought lists. No guessed addresses.',
  },
  {
    q: 'May I send marketing email to these addresses?',
    a: 'Check the rules in the recipient’s country first. Under the EU ePrivacy rules, many countries require prior consent for marketing email, including to businesses, info@ addresses and employees. nvoke does not give you permission to email anyone. Whether you send from nvoke or your own tool, you are the sender and it is on you.',
  },
  {
    q: 'Does nvoke send the emails?',
    a: 'If you want it to. Connect your own mailbox, start a campaign once, and nvoke writes each email, sends it from your mailbox in the recipient’s working hours and stops on a reply. Plain text, no tracking, 30 a day per mailbox. Never to Denmark or Germany, where B2B email needs consent. Or export the CSV and send it yourself.',
  },
  {
    q: 'What counts toward my monthly limit?',
    a: `Only addresses that verify as valid, each once per 12 months. Invalid, risky, catch-all and unknown are free. Free includes ${freeEmails} a month. Hit the limit and running searches stop. No overage. Upgrade, or wait for next month.`,
  },
  {
    q: 'Do I need to keep my computer on while a search runs?',
    a: 'No. Searches run on our servers. You need internet to start one and to see the results.',
  },
  {
    q: 'Do I have to install anything?',
    a: 'No. nvoke runs in your browser. nvoke Desktop is optional, for Windows, macOS and Linux, on the same account and plan. Its installers are not code signed yet, so Windows and macOS ask for one extra click the first time.',
  },
  {
    q: 'I run a website. How do I keep nvoke off it?',
    a: (
      <>
        Block <code className="font-mono text-sm text-foreground">nvokebot</code> in robots.txt, or opt out your domain
        or address on the{' '}
        <Link href="/opt-out" className="text-foreground underline underline-offset-4">
          opt-out page
        </Link>
        . It takes effect at once. The{' '}
        <Link href="/bot" className="text-foreground underline underline-offset-4">
          nvokebot page
        </Link>{' '}
        says exactly what the crawler does.
      </>
    ),
  },
];


export default function HomePage() {
  return (
    <>
      {/* The hero: one line, two keys, and the screen running a search. Nothing boxed. */}
      <section className="pt-20 pb-24 sm:pt-32 sm:pb-36">
        <Container>
          <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
            <Eyebrow className="text-primary">Find &#183; Crawl &#183; Verify</Eyebrow>
            <h1 className="mt-6 text-display font-light">
              <span className="block">Find companies.</span>
              <span className="block">Get emails that work.</span>
            </h1>
            <p className="mt-6 max-w-lg text-lede text-pretty text-muted-foreground">
              nvoke reads each company’s own website today and asks the mail server if the address exists.
            </p>
            <div className="mt-10 flex flex-wrap justify-center gap-3">
              <Button asChild size="xl" variant="dark">
                <Link href="/sign-up">Start free</Link>
              </Button>
              <Button asChild size="xl" variant="secondary">
                <Link href="/pricing">See pricing</Link>
              </Button>
            </div>
            <p className="cap mt-6 text-muted-foreground">{freeEmails} verified emails a month, free</p>
          </div>
          <LiveSearch large className="mx-auto mt-20 max-w-3xl sm:mt-28" />
        </Container>
      </section>

      {/* How it works: four columns on a hairline, a word and a line each. */}
      <section id="how-it-works" aria-labelledby="how-title" className="py-20 sm:py-28">
        <Container>
          <RevealHeading id="how-title" className="max-w-2xl text-headline font-light" lines={['A search in.', 'Verified emails out.']} />
          <Pipeline />
        </Container>
      </section>

      {/* Pricing: the ladder as one row of figures. */}
      <section id="pricing" aria-labelledby="pricing-title" className="py-20 sm:py-28">
        <Container>
          <div className="flex flex-col gap-8 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <RevealHeading id="pricing-title" className="text-headline font-light" lines={['Pay for emails that work.']} />
              <p className="mt-5 max-w-md text-lede text-pretty text-muted-foreground">
                One plan. Only valid addresses count.
              </p>
            </div>
            <Button asChild size="lg" variant="secondary" className="self-start sm:self-auto">
              <Link href="/pricing">See pricing</Link>
            </Button>
          </div>
          <PriceDisplay />
          <p className="cap mt-8 text-muted-foreground normal-case tracking-[0.02em]">{pricing.vatNote}</p>
        </Container>
      </section>

      {/* The desktop app and the agents: two columns, a line and a key each. */}
      <section aria-label="nvoke Desktop and agents" className="py-20 sm:py-28">
        <Container className="grid gap-16 sm:grid-cols-2 sm:gap-10">
          <div id="desktop" className="flex flex-col items-start border-t pt-6">
            <Eyebrow>nvoke Desktop</Eyebrow>
            <RevealHeading className="mt-8 text-title font-light" lines={['The power tools.']} />
            <p className="mt-3 max-w-sm text-[15px] text-pretty text-muted-foreground">
              Local render, a quick search over any app and grab from the screen. Windows, macOS and Linux.
            </p>
            <ShortcutKeys />
            <Button asChild size="lg" variant="secondary" className="mt-8">
              <Link href="/download">Get nvoke Desktop</Link>
            </Button>
          </div>
          <div id="agents" className="flex flex-col items-start border-t pt-6">
            <Eyebrow>Agents</Eyebrow>
            <RevealHeading className="mt-8 text-title font-light" lines={['Or let your agent do it.']} />
            <p className="mt-3 max-w-sm text-[15px] text-pretty text-muted-foreground">
              Every search, export and check over REST or MCP. Your agent can sign up alone.
            </p>
            <AgentCall />
            <Button asChild size="lg" variant="secondary" className="mt-8">
              <Link href="/agents">nvoke for agents</Link>
            </Button>
          </div>
        </Container>
      </section>

      <section id="faq" aria-labelledby="faq-title" className="py-20 sm:py-28">
        <Container className="grid gap-12 lg:grid-cols-[1fr_2fr] lg:gap-16">
          <RevealHeading id="faq-title" className="text-headline font-light" lines={['Questions.']} />
          <Faq items={FAQ} />
        </Container>
      </section>

      {/* The last call, over a huge counter climbing like a search finding leads. */}
      <section aria-labelledby="cta-title" className="relative overflow-hidden pt-24 sm:pt-36">
        <Container className="relative z-10 flex flex-col items-center text-center">
          <RevealHeading id="cta-title" className="max-w-4xl text-display font-light" lines={['Your first search', 'is a minute away.']} />
          <div className="mt-12 flex flex-wrap justify-center gap-3">
            <Button asChild size="xl" variant="dark">
              <Link href="/sign-up">Start free</Link>
            </Button>
            <Button asChild size="xl" variant="secondary">
              <Link href="/download">Get the desktop app</Link>
            </Button>
          </div>
          <p className="cap mt-6 text-muted-foreground">{freeEmails} verified emails a month, free</p>
        </Container>
        <div className="mt-12 sm:mt-16">
          <LeadCounter />
        </div>
      </section>
    </>
  );
}
