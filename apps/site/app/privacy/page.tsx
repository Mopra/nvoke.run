import type { Metadata } from 'next';
import Link from 'next/link';
import { CompanyLine, LegalPage } from '@/components/site/legal';
import { site } from '@/lib/site';

// DRAFT. This privacy policy is a working draft written for a Danish company
// under GDPR and the Danish Data Protection Act. It has not been reviewed by a
// lawyer. Fill in the company details in lib/site.ts, confirm the processor
// list and retention periods, and get it reviewed before launch.

export const metadata: Metadata = {
  title: 'Privacy policy',
  description: 'How nvoke handles personal data about customers and about the businesses it finds.',
  alternates: { canonical: '/privacy' },
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy policy" updated="13 October 2026">
      <section>
        <h2>Who we are</h2>
        <p>
          <CompanyLine />, is the data controller for the personal data described here. Write to{' '}
          <a href={`mailto:${site.email.privacy}`}>{site.email.privacy}</a> with any question about this policy or
          your data.
        </p>
        <p>
          nvoke handles personal data about two groups of people: our customers, and people whose business contact
          details appear on public websites that nvoke reads. This policy covers both.
        </p>
      </section>

      <section>
        <h2>Customers: what we collect</h2>
        <ul>
          <li>
            <strong>Account data:</strong> name, email address and sign-in details, handled by our sign-in provider.
          </li>
          <li>
            <strong>Billing data:</strong> company name, address, VAT number and payment status. Card details are
            handled by our payment provider and never reach us.
          </li>
          <li>
            <strong>Usage data:</strong> the searches you run, their results, and how many emails you used each month.
          </li>
          <li>
            <strong>Technical data:</strong> app version, operating system and error reports, used to keep the app
            working.
          </li>
          <li>
            <strong>Messages:</strong> what you write to us by email.
          </li>
        </ul>
        <p>
          We process this data to deliver the service under our agreement with you (GDPR article 6(1)(b)), to meet
          bookkeeping duties (article 6(1)(c)), and to keep the service secure and improve it (article 6(1)(f)).
        </p>
      </section>

      <section>
        <h2>Business contacts found by nvoke</h2>
        <p>
          When a customer runs a search, nvokebot visits the websites of the companies found and collects the email
          addresses published there, together with the company name, website, address and phone number from public
          sources such as OpenStreetMap and web search results. Some of these addresses identify a person, for
          example a name at a company domain.
        </p>
        <p>
          We process this data on the basis of legitimate interest (article 6(1)(f)): helping businesses find
          published contact details of other businesses. We limit it to addresses that the business itself has
          published, follow robots.txt, keep an opt-out list, and never send email to the addresses. We also check
          whether each address can receive mail, as described on the home page.
        </p>
        <p>
          The customer who ran the search decides how they use the results and is a separate controller for that use.
          Our terms require customers to follow the rules on marketing and data protection that apply to them.
        </p>
        <p>
          If your address appears in nvoke results, you can object, ask for a copy or ask us to delete it by writing to{' '}
          <a href={`mailto:${site.email.privacy}`}>{site.email.privacy}</a>. Website owners can also block our crawler
          as described on the <Link href="/bot">nvokebot page</Link>.
        </p>
      </section>

      <section>
        <h2>Who we share data with</h2>
        <p>We use these processors, under data processing agreements:</p>
        <ul>
          <li>Clerk, for sign-in and account management.</li>
          <li>Supabase, for the database that holds accounts, searches and results.</li>
          <li>Our server hosting provider, for the servers that run searches.</li>
          <li>Vercel, for hosting this website.</li>
          <li>Our payment provider, for subscriptions and invoices.</li>
        </ul>
        <p>
          Search keywords for web searches are sent to Brave Search. Some of these providers are based in the United
          States. Where data leaves the EU and EEA, we rely on the EU-US Data Privacy Framework or the European
          Commission’s standard contractual clauses.
        </p>
        <p>We do not sell personal data.</p>
      </section>

      <section>
        <h2>How long we keep it</h2>
        <ul>
          <li>Account and usage data: while your account is open, and up to 12 months after you close it.</li>
          <li>Search results: until you delete the search or close your account.</li>
          <li>Results of email checks: 30 days, so the same address is not checked again and again.</li>
          <li>Bookkeeping records: 5 years from the end of the financial year, as Danish law requires.</li>
          <li>Opt-out requests: for as long as we run nvokebot, so we can keep honoring them.</li>
        </ul>
      </section>

      <section>
        <h2>Your rights</h2>
        <p>
          You have the right to access, correct and delete your personal data, to restrict or object to our
          processing, and to receive your data in a portable format. Write to{' '}
          <a href={`mailto:${site.email.privacy}`}>{site.email.privacy}</a> and we will reply within one month.
        </p>
        <p>
          You can complain to the Danish Data Protection Agency (Datatilsynet),{' '}
          <a href="https://www.datatilsynet.dk">datatilsynet.dk</a>.
        </p>
      </section>

      <section>
        <h2>This website</h2>
        <p>
          This website does not use tracking or advertising cookies. It stores your light or dark theme choice in your
          browser. Signing in to the desktop app through this site sets the cookies needed for sign-in. Our hosting provider keeps short-lived server logs for security.
        </p>
      </section>

      <section>
        <h2>Changes</h2>
        <p>
          We update this policy when our processing changes. The date at the top shows the latest version. Customers
          are told by email about changes that matter.
        </p>
      </section>
    </LegalPage>
  );
}
