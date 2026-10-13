import type { Metadata } from 'next';
import Link from 'next/link';
import { CompanyLine, LegalPage } from '@/components/site/legal';
import { site } from '@/lib/site';

// DRAFT. This privacy policy is a working draft for Pradsgaard Labs, Denmark,
// under GDPR and the Danish Data Protection Act. It has not been reviewed by a
// lawyer. Check the company details in lib/site.ts, confirm the processor
// list and retention periods, and get it reviewed before launch. Keep it in
// step with the Danish version in app/da/privacy/page.tsx.
// TODO(owner): write the legitimate interest assessment (LIA) this page
// offers a summary of, and keep it on file.

export const metadata: Metadata = {
  title: 'Privacy policy',
  description:
    'How nvoke handles personal data about its customers and about people whose business contact details it finds on public websites.',
  alternates: { canonical: '/privacy', languages: { en: '/privacy', da: '/da/privacy' } },
};

const mail = <a href={`mailto:${site.email.privacy}`}>{site.email.privacy}</a>;

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy policy"
      updated="13 October 2026"
      alternate={{ href: '/da/privacy', lang: 'da', label: 'Dansk' }}
    >
      <section>
        <h2>Who we are</h2>
        <p>
          nvoke is made by <CompanyLine /> (“we”), the data controller for the personal data described here. Questions about this policy or your data: write to
          {mail}.
        </p>
        <p>nvoke is a prospecting research tool. It handles personal data about two groups of people:</p>
        <ul>
          <li>
            <strong>Customers</strong>, who use the nvoke app. See <a href="#customers">part A</a>.
          </li>
          <li>
            <strong>People whose business contact details nvoke finds</strong> on public websites, for example an
            employee whose work email address is on their company’s contact page. See{' '}
            <a href="#contacts">part B</a>. Found nvoke because your address showed up somewhere? This is your part.
          </li>
        </ul>
      </section>

      <section id="customers">
        <h2>A. Customers</h2>
        <h3>What we collect</h3>
        <ul>
          <li>
            <strong>Account data:</strong> name, email address and sign-in details, handled by Clerk.
          </li>
          <li>
            <strong>Billing data:</strong> plan, payment status, and the company name, address and VAT number you give
            for invoices. Card details are handled by the payment provider and never reach us.
          </li>
          <li>
            <strong>Usage data:</strong> the searches you run, their results, and how many verified emails you used
            each month.
          </li>
          <li>
            <strong>Technical data:</strong> the device name, app version and operating system of each signed-in
            device, and server logs with IP addresses, used to keep the service secure and working.
          </li>
          <li>
            <strong>Messages:</strong> what you write to us by email.
          </li>
        </ul>
        <h3>Why, and on what legal basis</h3>
        <p>
          To deliver the service under our agreement with you (GDPR article 6(1)(b)), to meet bookkeeping duties
          (article 6(1)(c)), and to keep the service secure and improve it (article 6(1)(f)).
        </p>
        <h3>How long we keep it</h3>
        <ul>
          <li>Account and usage data: while your account is open, and up to 12 months after you close it.</li>
          <li>Search results: 12 months after the search ran, or earlier if you delete the search or your account.</li>
          <li>Bookkeeping records: 5 years from the end of the financial year, as bookkeeping law requires.</li>
        </ul>
      </section>

      <section id="contacts">
        <h2>B. People whose business contact details nvoke finds</h2>
        <p>
          This part is our notice under GDPR article 14, for people whose data we did not get from them directly.
        </p>

        <h3>What we collect</h3>
        <ul>
          <li>
            <strong>Company data:</strong> company name, website, postal address, phone number and type of business.
          </li>
          <li>
            <strong>Email addresses published on the company’s own website</strong>, with the page where each one was
            found and when we first and last saw it. Most are generic addresses like info@ or contact@. Some identify a
            person, for example firstname@company.com.
          </li>
          <li>
            <strong>The result of a mailbox check:</strong> whether the address’s mail server says it can receive mail
            (valid, invalid, catch-all, risky or unknown).
          </li>
        </ul>
        <p>
          We do not collect anything that requires a login, we do not guess addresses, we do not buy lists, and we do
          not collect special categories of data such as health, religion or political views.
        </p>

        <h3>Where it comes from</h3>
        <ul>
          <li>
            The company’s own website: the home page and up to seven pages that usually hold contact details, such as
            contact, about, team, imprint, privacy and legal pages. Our crawler, nvokebot, follows robots.txt and is
            described on the <Link href="/bot">nvokebot page</Link>.
          </li>
          <li>OpenStreetMap (through the Nominatim and Overpass services), for local businesses.</li>
          <li>Brave Search, for companies that match a keyword.</li>
          <li>
            Product Hunt and Show HN (Hacker News, through Algolia’s HN Search API), for newly launched products.
          </li>
          <li>The mail server of the address’s domain, for the mailbox check. No email is ever sent.</li>
        </ul>
        <p>If you ask, we tell you the exact page your address came from.</p>

        <h3>Why we process it</h3>
        <p>
          To let our customers research companies they may want to work with: who the companies are, and how they can
          be contacted through the details they publish themselves.
        </p>

        <h3>Legal basis, in plain words</h3>
        <p>
          We rely on legitimate interest (GDPR article 6(1)(f)). Our interest, and our customers’, is to find businesses
          and the contact details those businesses have chosen to publish. We have weighed that against your interests
          and decided it is fair, because:
        </p>
        <ul>
          <li>we only use contact details a business has published on its own website for people to contact it;</li>
          <li>we only read the pages that usually hold such details, and follow robots.txt;</li>
          <li>we never log in, fill in forms or get around CAPTCHAs or other access limits;</li>
          <li>an address that identifies a person is never shared between customers (see below);</li>
          <li>we delete data on a fixed schedule, and nothing is kept just because it was searched again;</li>
          <li>we never send email to the addresses we find;</li>
          <li>you can opt out at once, without an account, and we never collect your address again.</li>
        </ul>
        <p>You can ask us for a summary of this assessment.</p>

        <h3>Who receives it</h3>
        <ul>
          <li>
            <strong>Generic addresses</strong> (like info@) on the company’s own domain are kept in a shared cache and
            can appear in the results of any customer whose search finds the company. Company data such as name and
            phone number comes from the public sources above and is stored with each customer’s search.
          </li>
          <li>
            <strong>Addresses that identify a person</strong> are only shown to the customer whose search found them.
            They are stored with that customer’s results and are not reused for anyone else.
          </li>
        </ul>
        <p>
          Customers are businesses. Each one is a separate controller for what it does with the results, and our{' '}
          <Link href="/terms">terms</Link> require it to follow data protection and marketing law, honour objections
          and never contact people who have opted out. Our service providers, listed below, also process the data on our
          behalf.
        </p>

        <h3>How long we keep it</h3>
        <ul>
          <li>
            Generic addresses in the shared cache: deleted 12 months after we first collected them, even if we see them
            again, and earlier if a later visit to the site no longer finds them.
          </li>
          <li>
            The cache is used for at most 90 days after a visit (7 days if the site could not be read). The next search
            that finds the company after that reads the site again, and addresses that are gone are dropped.
          </li>
          <li>Addresses in a customer’s search results: deleted 12 months after the search ran.</li>
          <li>
            Results of mailbox checks: 30 days in our check cache. The result shown with an address in a customer’s
            search is deleted with that search.
          </li>
          <li>A record that a customer was charged for an address, so it is not charged twice: 12 months.</li>
          <li>
            Opt-outs: kept for good, but only as a one-way hash of the address or domain, so we can recognise it and
            never collect it again.
          </li>
        </ul>

        <h3>How to opt out</h3>
        <p>
          Enter your email address or your company’s domain on the <Link href="/opt-out">opt-out page</Link>. It works
          at once, needs no confirmation, deletes what we hold, and stops us from collecting it again. Shared mailbox
          providers such as gmail.com cannot be opted out as a whole domain; opt out your own address instead. Website
          owners can also block nvokebot in robots.txt.
        </p>
      </section>

      <section>
        <h2>Service providers</h2>
        <p>We use these providers, under data processing agreements where they process personal data for us:</p>
        <ul>
          <li>Clerk, for sign-in, account management and subscription billing.</li>
          {/* TODO(owner): confirm that Clerk Billing processes cards through Stripe. */}
          <li>Stripe, the payment processor behind Clerk’s billing, for card payments.</li>
          {/* TODO(owner): confirm the Supabase project region and name it here. */}
          <li>Supabase, for the Postgres database, hosted in the EU.</li>
          {/* TODO(owner): name the VPS host and the country of the data centre. */}
          <li>Our server host, for the servers that run searches, crawling and mailbox checks.</li>
          <li>Vercel, for hosting this website.</li>
          <li>Brave Search API, which receives the search keywords customers enter.</li>
          <li>
            OpenStreetMap Nominatim and the public Overpass servers (overpass-api.de, with overpass.private.coffee as a
            fallback), which receive the place and type of business searched for.
          </li>
          <li>Product Hunt API and Algolia’s HN Search API, which receive the keyword for launch searches.</li>
        </ul>
        <p>
          Some of these providers are based in the United States. Where personal data leaves the EU and EEA, we rely on
          the EU-US Data Privacy Framework or the European Commission’s standard contractual clauses. We do not sell
          personal data.
        </p>
      </section>

      <section>
        <h2>Your rights</h2>
        <p>
          You have the right to access your data and learn where it came from, to have it corrected or deleted, to
          restrict or object to our processing, and to receive data you gave us in a portable format. An objection to
          processing based on legitimate interest stops it. Write to {mail} and we will answer within one month.
        </p>
        <p>
          You can complain to the Danish Data Protection Agency (Datatilsynet),{' '}
          <a href="https://www.datatilsynet.dk">datatilsynet.dk</a>.
        </p>
        <p>We do not make automated decisions about you that have legal or similar effects.</p>
      </section>

      <section>
        <h2>This website</h2>
        <p>
          This website does not use tracking or advertising cookies. It stores your light or dark theme choice in your
          browser. Signing in to the desktop app through this site sets the cookies needed for sign-in. What you enter
          on the opt-out page is sent to our server and kept only as a one-way hash. Our hosting providers keep
          short-lived server logs for security.
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
