import type { Metadata } from 'next';
import Link from 'next/link';
import { CompanyLine, LegalPage } from '@/components/site/legal';
import { site } from '@/lib/site';

// DRAFT. These terms are a working draft for a B2B subscription operated
// by Pradsgaard Labs in Denmark. They have not been reviewed by a lawyer.
// Company details live in lib/site.ts. Confirm the payment, refund and liability terms, and
// get them reviewed before launch.

export const metadata: Metadata = {
  title: 'Terms of service',
  description: 'The terms for using the nvoke desktop app and service.',
  alternates: { canonical: '/terms' },
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms of service" updated="20 October 2026">
      <section>
        <h2>1. About these terms</h2>
        <p>
          nvoke is made by <CompanyLine /> (“we”). These terms apply between you and us when you use the nvoke desktop app and the
          service behind it. By creating an account you accept them. If you accept on behalf of a business, you confirm
          that you may bind it.
        </p>
        <p>
          nvoke is offered to businesses, not to consumers. Consumer protection rules, including the right of
          withdrawal, therefore do not apply.
        </p>
      </section>

      <section>
        <h2>2. The service</h2>
        <p>
          nvoke finds companies from public sources, reads their websites, collects the contact details they publish
          and checks whether the email addresses can receive mail. If you connect a mailbox, nvoke also writes emails
          and sends them from that mailbox on your instructions (section 5). We work to make results accurate, but we
          cannot promise that every company, address or verification result is complete or correct.
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
        <p>
          nvoke gives you companies and the contact details they publish. It does not give you permission to contact anyone, and you are responsible for how you use the results. In
          particular you agree to:
        </p>
        <ul>
          <li>use nvoke only for lawful business purposes, and only to research businesses, not consumers;</li>
          <li>
            follow data protection law, including GDPR, when you store and use the results, as an independent
            controller for that use, including telling people where you got their details when the law requires it;
          </li>
          <li>
            follow the rules on electronic marketing in the recipient’s country, not only in yours, before you contact
            anyone;
          </li>
          <li>
            for recipients in Denmark, follow section 10 of the Danish Marketing Practices Act (Markedsføringsloven).
            It requires prior consent for marketing by email, also when the recipient is a business, a generic address
            like info@ or a named employee, and an email that asks for consent counts as marketing too;
          </li>
          <li>
            honour every objection and opt-out you receive, at once, and never contact people or domains that nvoke
            has suppressed or that have objected to you;
          </li>
          <li>
            not use the results to profile people based on special categories of data, such as health, religion,
            ethnic origin, political views or sexual orientation;
          </li>
          <li>not use nvoke to send spam, to harass anyone, or for any unlawful purpose;</li>
          <li>not resell the results as a list or database product, or share them outside your own business;</li>
          <li>
            not try to get around plan limits, overload the service, or reverse engineer it beyond what the law allows.
          </li>
        </ul>
        <p>
          Search results are deleted from nvoke 12 months after the search ran. Results may also disappear earlier when
          a person or domain opts out. Delete exported copies when you no longer need them.
        </p>
        <p>
          We may suspend or close accounts that break these rules or that we reasonably suspect of abuse, and we may
          tell the authorities when the law requires it. You are responsible for claims that arise from your use of the
          results.
        </p>
      </section>

      <section>
        <h2>5. Sending from your mailboxes</h2>
        <p>
          You can connect your own mailboxes and run campaigns: nvoke writes the emails and sends them from your
          mailbox, in your name, and reads the replies there. <strong>You are the sender.</strong> Every email nvoke
          sends for you is your email, sent on your instructions, and section 4 applies to it as to anything you send
          yourself. In addition you agree to:
        </p>
        <ul>
          <li>follow the law of each recipient’s country on marketing email and data protection;</li>
          <li>send only to business addresses, never to consumers or private addresses;</li>
          <li>connect only mailboxes and domains you own or may send from, and keep their mail provider’s rules;</li>
          <li>
            read what nvoke writes before you start a campaign and stand behind it. You can edit or stop any email
            before it goes out;
          </li>
          <li>
            accept the limits we set: no sends to recipients in Denmark or Germany, only verified addresses, daily
            caps per mailbox, sending in the recipient’s working hours, and the footer in every email that says where
            the address was found and how to stop. These are not settings;
          </li>
          <li>not remove the unsubscribe or ask us to send faster than the caps allow.</li>
        </ul>
        <p>
          A reply, an unsubscribe or a bounce stops further emails to that address. We may pause or stop any campaign
          or mailbox at any time, for example on high bounce rates, complaints, or if we suspect a breach of these
          terms. We do not promise that any email reaches the inbox.
        </p>
      </section>

      <section>
        <h2>6. Plans, prices and payment</h2>
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
        <h2>7. Cancelling</h2>
        <p>
          You can cancel a paid plan at any time. It stays active until the end of the period you have paid for, then
          your account moves to the Free plan. We do not refund part periods. You can close your account entirely by
          writing to <a href={`mailto:${site.email.hello}`}>{site.email.hello}</a>.
        </p>
      </section>

      <section>
        <h2>8. The desktop app</h2>
        <p>
          We give you a personal, non-exclusive right to install and use the nvoke app on your computers while you
          have an account. Updates may be required to keep using the service.
        </p>
      </section>

      <section>
        <h2>9. Liability</h2>
        <p>
          The service is provided as it is. We are not liable for indirect losses, such as lost profit, lost business
          or lost data. Our total liability in any 12 month period is limited to the amount you paid us in that period.
          These limits do not apply where the law does not allow them, for example in case of gross negligence or
          intent.
        </p>
      </section>

      <section>
        <h2>10. Personal data and roles</h2>
        <p>
          <strong>nvoke is the controller</strong> for collecting company data and contact details from public sources,
          for classifying and verifying them, for the shared cache of generic addresses, for the opt-out list, and for
          your account data.
        </p>
        <p>
          <strong>You are an independent controller</strong> for your own use of the results: what you store, export,
          combine with other data and do with it. Each of us is responsible for our own part.
        </p>
        <p>
          <strong>When nvoke sends for you, we are your processor.</strong> You are the controller for your outreach:
          who gets an email, what it says and why. We write, send and read replies only on your instructions and to run
          the service, keep it confidential and secure, use the sub-processors named in our privacy policy (Claude
          through OpenRouter writes the emails), and delete it on the schedule in our privacy policy or when you ask.
          Data processing terms for sending will be added to these terms.
        </p>
        <p>
          If someone asks you about data you got from nvoke, you may tell them it came from nvoke and point them to our{' '}
          <Link href="/opt-out">opt-out page</Link>. How we handle personal data is described in our{' '}
          <Link href="/privacy">privacy policy</Link>.
        </p>
      </section>

      <section>
        <h2>11. Changes to these terms</h2>
        <p>
          We may update these terms. We tell you about material changes by email at least 30 days before they take
          effect. If you keep using nvoke after that, the new terms apply.
        </p>
      </section>

      <section>
        <h2>12. Law and disputes</h2>
        <p>
          These terms are governed by Danish law. Disputes go to the Danish courts, with the Copenhagen City Court
          (Københavns Byret) as the first instance.
        </p>
      </section>
    </LegalPage>
  );
}
