import type { Metadata } from 'next';
import Link from 'next/link';
import { CompanyLine, LegalPage } from '@/components/site/legal';
import { site } from '@/lib/site';

// DRAFT. These terms are a working draft for a Danish company selling a B2B
// subscription. They have not been reviewed by a lawyer. Fill in the company
// details in lib/site.ts, confirm the payment, refund and liability terms, and
// get them reviewed before launch.

export const metadata: Metadata = {
  title: 'Terms of service',
  description: 'The terms for using the nvoke desktop app and service.',
  alternates: { canonical: '/terms' },
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms of service" updated="13 October 2026">
      <section>
        <h2>1. About these terms</h2>
        <p>
          These terms apply between you and <CompanyLine /> (“nvoke”, “we”) when you use the nvoke desktop app and the
          service behind it. By creating an account you accept them. If you accept on behalf of a company, you confirm
          that you may bind it.
        </p>
        <p>
          nvoke is offered to businesses, not to consumers. Danish consumer protection rules, including the right of
          withdrawal, therefore do not apply.
        </p>
      </section>

      <section>
        <h2>2. The service</h2>
        <p>
          nvoke finds companies from public sources, reads their websites, collects published email addresses and
          checks whether they can receive mail. We work to make results accurate, but we cannot promise that every
          company, address or verification result is complete or correct.
        </p>
        <p>
          We may change, add or remove features. If we remove something central to a paid plan, we tell you in advance
          and you may cancel.
        </p>
      </section>

      <section>
        <h2>3. Your account</h2>
        <p>
          Keep your sign-in details to yourself and tell us if you think someone else has used your account. You are
          responsible for activity in your account.
        </p>
      </section>

      <section>
        <h2>4. How you may use the results</h2>
        <p>You are responsible for how you use the data you get from nvoke. In particular you agree to:</p>
        <ul>
          <li>
            follow data protection law, including GDPR, when you store and use the results, and act as an independent
            controller for that use;
          </li>
          <li>
            follow the rules on electronic marketing that apply to you and the recipient, such as section 10 of the
            Danish Marketing Practices Act, which in most cases requires prior consent for marketing email;
          </li>
          <li>not use nvoke to send spam, to harass anyone, or for any unlawful purpose;</li>
          <li>not resell the results as a list or database product;</li>
          <li>
            not try to get around plan limits, overload the service, or reverse engineer it beyond what the law allows.
          </li>
        </ul>
        <p>We may suspend accounts that break these rules.</p>
      </section>

      <section>
        <h2>5. Plans, prices and payment</h2>
        <p>
          Plans, monthly limits and prices are listed on the <Link href="/pricing">pricing page</Link>. Prices exclude
          VAT. Paid plans are billed in advance each month and renew automatically until cancelled.
        </p>
        <p>
          Monthly limits reset at the start of each calendar month. Unused emails do not carry over. We may change
          prices with at least 30 days’ notice by email. The new price applies from your next billing period.
        </p>
      </section>

      <section>
        <h2>6. Cancelling</h2>
        <p>
          You can cancel a paid plan at any time. It stays active until the end of the period you have paid for, then
          your account moves to the Free plan. We do not refund part periods. You can close your account entirely by
          writing to <a href={`mailto:${site.email.hello}`}>{site.email.hello}</a>.
        </p>
      </section>

      <section>
        <h2>7. The desktop app</h2>
        <p>
          We give you a personal, non-exclusive right to install and use the nvoke app on your computers while you
          have an account. Updates may be required to keep using the service.
        </p>
      </section>

      <section>
        <h2>8. Liability</h2>
        <p>
          The service is provided as it is. We are not liable for indirect losses, such as lost profit, lost business
          or lost data. Our total liability in any 12 month period is limited to the amount you paid us in that period.
          These limits do not apply where the law does not allow them, for example in case of gross negligence or
          intent.
        </p>
      </section>

      <section>
        <h2>9. Personal data</h2>
        <p>
          How we handle personal data is described in our <Link href="/privacy">privacy policy</Link>.
        </p>
      </section>

      <section>
        <h2>10. Changes to these terms</h2>
        <p>
          We may update these terms. We tell you about material changes by email at least 30 days before they take
          effect. If you keep using nvoke after that, the new terms apply.
        </p>
      </section>

      <section>
        <h2>11. Law and disputes</h2>
        <p>
          These terms are governed by Danish law. Disputes go to the Danish courts, with the Copenhagen City Court
          (Københavns Byret) as the first instance.
        </p>
      </section>
    </LegalPage>
  );
}
