import type { Metadata } from 'next';
import { WEBHOOKS_MAX } from '@nvoke/shared';
import { CodeBlock } from '@/components/docs/code-block';
import { DocsSection, DocsTitle, Prose } from '@/components/docs/prose';
import { urls } from '@/lib/docs';

export const metadata: Metadata = {
  title: 'Webhooks',
  description: 'Get every verified lead pushed to your URL the moment it checks out. Daily drops included. Signed the Standard Webhooks way.',
  alternates: { canonical: '/docs/webhooks' },
};

const CREATE = `curl -X POST "${urls.apiBase}/webhooks" \\
  -H "Authorization: Bearer $NVOKE_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"url":"https://example.com/hooks/nvoke","events":["lead.ready"],"scope":"drops"}'`;

const LEAD_READY = JSON.stringify(
  {
    type: 'lead.ready',
    timestamp: '2026-10-13T08:12:03.512Z',
    data: {
      search: { id: '6f1c…', kind: 'drop', dropId: '0b7e…', dropName: 'AI launches' },
      company: {
        id: '9a2d…',
        name: 'Acme Robotics',
        domain: 'acme.dev',
        website: 'https://acme.dev/',
        source: 'show_hn',
        sourceRef: '41234567',
        location: null,
        phone: null,
        category: 'Robots that fold laundry',
        crawlStatus: 'done',
        crawledAt: '2026-10-13T08:02:11.000Z',
        emails: [
          {
            id: 'c41e…',
            address: 'hello@acme.dev',
            kind: 'generic',
            sourceUrl: 'https://acme.dev/contact',
            verification: 'valid',
            checkedAt: '2026-10-13T08:12:03.000Z',
          },
        ],
      },
    },
  },
  null,
  2,
);

const HEADERS = `POST /hooks/nvoke HTTP/1.1
content-type: application/json
user-agent: nvoke-webhooks/1.0 (+https://nvoke.run/docs/webhooks)
webhook-id: 2f8e0c4a-5b1d-4b8e-9d4f-1c2a3b4c5d6e
webhook-timestamp: 1791792723
webhook-signature: v1,K5oZfzN95Z9UVu1EsfQmfVNQhnkZ2pj9o9NDN/H/pI4=`;

const VERIFY_LIB = `// npm install standardwebhooks
import { Webhook } from 'standardwebhooks';

const wh = new Webhook(process.env.NVOKE_WEBHOOK_SECRET); // whsec_...

app.post('/hooks/nvoke', express.raw({ type: 'application/json' }), (req, res) => {
  let event;
  try {
    event = wh.verify(req.body, req.headers); // throws on a bad signature or an old timestamp
  } catch {
    return res.status(400).end();
  }
  res.status(204).end(); // answer first, work after
  queue.push(event);
});`;

const VERIFY_PLAIN = `import { createHmac, timingSafeEqual } from 'node:crypto';

function verify(secret, headers, rawBody) {
  const id = headers['webhook-id'];
  const ts = headers['webhook-timestamp'];
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false; // older than 5 minutes
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const expected = createHmac('sha256', key).update(\`\${id}.\${ts}.\${rawBody}\`).digest();
  return headers['webhook-signature'].split(' ').some((sig) => {
    const given = Buffer.from(sig.replace(/^v1,/, ''), 'base64');
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}`;

export default function WebhooksDocs() {
  return (
    <>
      <DocsTitle
        title="Webhooks"
        intro="Stop polling. Give nvoke a URL and every company with a verified address lands there the moment its checks are done. Pair it with a drop and fresh launches flow into your CRM every day."
      />

      <DocsSection id="setup" title="Set one up">
        <Prose>
          <p>
            In the desktop app: Account, Webhooks, New webhook. Or over the API with any key. The response holds the
            signing secret, once. Up to {WEBHOOKS_MAX} webhooks per account.
          </p>
        </Prose>
        <CodeBlock label="shell" code={CREATE} />
        <Prose>
          <p>
            <code>scope</code> is <code>all</code> (every search, drops included) or <code>drops</code> (only what drops
            find). Add <code>dropId</code> to follow one drop. <code>events</code> defaults to both. Then send a test:{' '}
            <code>POST /v1/webhooks/$WEBHOOK_ID/test</code> fires a signed <code>ping</code> and tells you what your server
            answered.
          </p>
        </Prose>
      </DocsSection>

      <DocsSection id="events" title="Events">
        <Prose>
          <p>
            <strong>
              <code>lead.ready</code>
            </strong>{' '}
            One per company that has at least one valid address, sent once every address it has is checked. Greylisting
            mail servers make some checks wait up to 20 minutes, so leads arrive over the life of a search, not all at
            once. If a search stops at your monthly limit, the companies that already have a valid address are sent
            anyway. <code>company</code> has the same shape as{' '}
            <a href="/docs/api#list-companies">the company list</a>, with every checked address and its verdict.
          </p>
          <p>
            <strong>
              <code>search.finished</code>
            </strong>{' '}
            A search ended as <code>done</code> or <code>failed</code>. Carries the search with its counters. Usually
            arrives after that search’s leads. Canceling sends nothing.
          </p>
        </Prose>
        <CodeBlock label="lead.ready" code={LEAD_READY} />
      </DocsSection>

      <DocsSection id="verify" title="Verify the signature">
        <Prose>
          <p>
            Requests follow <a href="https://www.standardwebhooks.com">Standard Webhooks</a>, so its libraries for
            Node, Python, Go, Ruby, PHP and more verify them. <code>webhook-signature</code> is <code>v1,</code> plus the
            base64 HMAC SHA-256 of <code>{'{webhook-id}.{webhook-timestamp}.{body}'}</code>, keyed with the base64 part
            of your <code>whsec_</code> secret. Verify the raw body, before any JSON parsing.
          </p>
        </Prose>
        <CodeBlock label="request" code={HEADERS} />
        <CodeBlock label="express" code={VERIFY_LIB} />
        <Prose>
          <p>Without a library:</p>
        </Prose>
        <CodeBlock label="node" code={VERIFY_PLAIN} />
      </DocsSection>

      <DocsSection id="delivery" title="Delivery and retries">
        <Prose>
          <p>
            Answer with any 2xx within 10 seconds. Do the work after you answer. Redirects are not followed.
          </p>
          <p>
            A failed attempt is tried again after 5 seconds, 5 minutes, 30 minutes, 2 hours, 5 hours, 10 hours and 10
            hours. Every retry carries the same <code>webhook-id</code>, so dedupe on it. Order is not guaranteed.
          </p>
          <p>
            A webhook that fails for a whole day is turned off. Fix the receiver, then turn it on again in the app or
            with <code>{'PATCH /v1/webhooks/$WEBHOOK_ID {"enabled":true}'}</code>. Pausing or turning a webhook off
            drops what was queued for it. <code>GET /v1/webhooks/$WEBHOOK_ID/deliveries</code> shows the last 50 with
            your server’s answers.
          </p>
          <p>
            Each payload is built when it is sent. If the search was deleted or an address opted out in the meantime,
            the delivery is skipped rather than sent with data we no longer hold.
          </p>
        </Prose>
      </DocsSection>

      <DocsSection id="rules" title="Rules">
        <Prose>
          <p>
            HTTPS only, on a public address. URLs that resolve to localhost, private networks or cloud metadata
            addresses are refused with <code>webhook_url_not_allowed</code>. Keep the secret on your server; anyone who
            has it can forge events. To rotate it, create a new webhook and delete the old one.
          </p>
          <p>
            What you do with the leads is on you. In the EU, marketing email to these addresses usually needs prior
            consent. Campaigns nvoke sends go from your mailbox, in your name: you are the sender.
          </p>
        </Prose>
      </DocsSection>
    </>
  );
}
