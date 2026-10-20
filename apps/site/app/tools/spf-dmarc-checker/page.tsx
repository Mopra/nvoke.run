import type { Metadata } from 'next';
import { EmailAuthChecker } from '@/components/site/tools/email-auth-checker';
import { ToolPage, type ToolFaq, type ToolStep, type ToolTerm } from '@/components/site/tools/tool-page';
import { toolOpenGraph } from '@/lib/tools';

const title = 'SPF and DMARC checker';
const description =
  'Check a domain’s MX, SPF, DMARC and DKIM records in one go. Graded pass, warning or fail, with the raw records and what to fix. Free, no sign-up.';

export const metadata: Metadata = {
  title: 'SPF and DMARC checker: test MX, SPF, DMARC and DKIM',
  description,
  alternates: { canonical: '/tools/spf-dmarc-checker' },
  openGraph: toolOpenGraph('SPF and DMARC checker', description, '/tools/spf-dmarc-checker'),
};

const STEPS: ToolStep[] = [
  {
    title: 'MX and SPF',
    body: 'The mail servers, then SPF. We follow every include and count lookups: more than 10 breaks SPF silently.',
  },
  {
    title: 'DMARC',
    body: 'The record at _dmarc, graded by policy. None watches, quarantine sends to spam, reject blocks.',
  },
  {
    title: 'DKIM',
    body: 'Keys hide behind selectors DNS cannot list. We try the common ones. Not finding one proves nothing.',
  },
];

const TERMS: ToolTerm[] = [
  {
    term: <span className="font-mono">MX</span>,
    meaning: 'The servers that receive mail for the domain. Without them, replies to you go nowhere.',
  },
  {
    term: <span className="font-mono">SPF</span>,
    meaning:
      'A TXT record listing the servers allowed to send as your domain. It should end in -all (reject the rest) or ~all (mark the rest).',
  },
  {
    term: <span className="font-mono">DMARC</span>,
    meaning:
      'Tells receivers what to do when a message fails SPF and DKIM, and where to send reports. Gmail and Yahoo require one from bulk senders.',
  },
  {
    term: <span className="font-mono">DKIM</span>,
    meaning: 'A signature on every message, checked against a public key in DNS. Proves the mail is yours and untouched.',
  },
  {
    term: 'Pass, warning, fail',
    meaning:
      'Pass is set up right. Warning works but is weak, like p=none or ~all. Fail is missing or broken, and costs you the inbox.',
  },
];

const FAQ: ToolFaq[] = [
  {
    q: 'Why does this matter for cold outreach?',
    a: 'Gmail, Yahoo and Microsoft check SPF, DKIM and DMARC on every message. Missing or broken records send your mail to spam or get it rejected, no matter how good the list is.',
  },
  {
    q: 'DKIM says not found, but I set it up.',
    a: 'Probably fine. DKIM keys live under a selector only your provider knows, and DNS cannot list them. We try the common selectors. Send yourself a message and check the DKIM-Signature header for the real one.',
  },
  {
    q: 'What is the 10 lookup limit?',
    a: 'SPF allows at most 10 DNS lookups while a receiver evaluates it, includes and their includes counted. Go over and SPF fails for every message. Flatten includes or drop services you no longer use.',
  },
  {
    q: 'Should DMARC be p=reject?',
    a: 'Eventually. Start at p=none with a report address, check that all your real mail passes, then move to quarantine and reject. p=none forever protects nobody.',
  },
  {
    q: 'Does nvoke send email?',
    a: 'Only when you ask. nvoke sends campaigns from your own mailbox, so your domain’s SPF, DKIM and DMARC decide where they land. Run this check before you connect it.',
  },
];

export default function SpfDmarcCheckerPage() {
  return (
    <ToolPage
      slug="spf-dmarc-checker"
      title={title}
      intro="The four DNS records that decide inbox or spam, graded in a second."
      widget={<EmailAuthChecker />}
      stepsIntro="Public DNS only. We never touch your mail."
      steps={STEPS}
      termsTitle="The four records"
      terms={TERMS}
      faq={FAQ}
    />
  );
}
