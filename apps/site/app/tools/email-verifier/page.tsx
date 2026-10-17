import type { Metadata } from 'next';
import { EmailVerifier } from '@/components/site/tools/email-verifier';
import { ToolPage, type ToolFaq, type ToolStep, type ToolTerm } from '@/components/site/tools/tool-page';
import { toolOpenGraph } from '@/lib/tools';
import { StatusPill } from '@/components/site/tools/status-pill';

const title = 'Free email verifier';
const description =
  'Check if an email address exists. nvoke asks the mail server about the mailbox and hangs up before anything is sent. Free, no sign-up.';

export const metadata: Metadata = {
  title: 'Free email verifier: check if an email address exists',
  description,
  alternates: { canonical: '/tools/email-verifier' },
  openGraph: toolOpenGraph('Free email verifier', description, '/tools/email-verifier'),
};

const STEPS: ToolStep[] = [
  {
    title: 'Syntax and domain',
    body: 'We check the address is well formed, the domain is not a typo of a big provider and not a throwaway service.',
  },
  {
    title: 'DNS',
    body: 'We look up the domain’s MX records. No mail server, or a parked domain, means nothing can arrive.',
  },
  {
    title: 'The mailbox',
    body: 'We open an SMTP conversation with the mail server, ask about the mailbox and hang up before a message would be sent. We also test a made up address, to catch servers that say yes to everything.',
  },
];

const TERMS: ToolTerm[] = [
  {
    term: <StatusPill tone="good">Deliverable</StatusPill>,
    meaning: 'The mail server confirmed the mailbox exists. Mail should arrive.',
  },
  {
    term: <StatusPill tone="bad">Does not exist</StatusPill>,
    meaning: 'Bad syntax, no mail server, a disposable domain, or the server rejected the mailbox. Mail would bounce.',
  },
  {
    term: <StatusPill tone="info">Accepts everything</StatusPill>,
    meaning:
      'A catch-all domain. The server says yes to any address, so no outside check can prove this one is real.',
  },
  {
    term: <StatusPill tone="warn">Risky</StatusPill>,
    meaning: 'A temporary or unclear answer, like a full mailbox or "try later". It may work, it may bounce.',
  },
  {
    term: <StatusPill tone="none">Could not confirm</StatusPill>,
    meaning: 'The domain takes mail, but the server would not answer about the mailbox. Often an anti spam wall.',
  },
];

const FAQ: ToolFaq[] = [
  {
    q: 'Does the check send an email?',
    a: 'No. We talk to the mail server the way a sending server would, ask whether the mailbox exists and quit before the message part. Nothing lands in anyone’s inbox.',
  },
  {
    q: 'How accurate is it?',
    a: 'As accurate as the mail server is honest. A "Deliverable" answer comes from the server itself. Catch-all domains and servers that refuse to answer cannot be confirmed by anyone from the outside, and we say so instead of guessing.',
  },
  {
    q: 'Why did I get "We checked the domain, not the mailbox"?',
    a: 'Mailbox checks cost us real SMTP conversations, and mail servers punish anyone who makes too many. The free tool has a daily budget. When it runs out we still check syntax and DNS. Signed in, nvoke checks the mailbox every time.',
  },
  {
    q: 'Is there a limit?',
    a: 'A few checks per network per hour, and a daily cap for everyone. nvoke itself checks thousands of addresses a month, free up to the free plan’s allowance.',
  },
  {
    q: 'Do you store the address I check?',
    a: 'We cache the result, so a repeat check does not hit the mail server again. We do not add it to any list or sell it. You can opt any address out of nvoke for good on the opt-out page.',
  },
];

export default function EmailVerifierPage() {
  return (
    <ToolPage
      slug="email-verifier"
      title={title}
      intro="Paste an address. We ask its mail server whether the mailbox exists, and hang up before anything is sent."
      widget={<EmailVerifier />}
      stepsIntro="Three checks, in order. Each one can stop the next."
      steps={STEPS}
      termsTitle="What the results mean"
      terms={TERMS}
      faq={FAQ}
    />
  );
}
