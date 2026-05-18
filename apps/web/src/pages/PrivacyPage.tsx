const LAST_UPDATED = "April 21, 2026";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <article className="mx-auto max-w-2xl px-6 py-20">
        <h1 className="text-4xl font-semibold tracking-tight text-foreground">
          Privacy Policy
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Last updated: {LAST_UPDATED}
        </p>

        <p className="mt-6 rounded-md border border-primary/30 bg-primary/5 p-4 font-mono text-xs text-primary">
          Draft — pending legal review. Replace the bracketed placeholders with
          the legal entity, CVR, registered address, and DPO contact before
          launch.
        </p>

        <div className="mt-10 space-y-10 text-sm leading-relaxed text-muted-foreground">
          <Section title="1. Who we are">
            <p>
              nvoke (&quot;nvoke&quot;, &quot;we&quot;, &quot;us&quot;) is
              operated by{" "}
              <Placeholder>
                [Legal entity name, CVR, registered address, Denmark]
              </Placeholder>
              . We are the data controller for personal data processed through
              the nvoke service available at <code>app.nvoke.run</code>,{" "}
              <code>api.nvoke.run</code>, <code>nvoke.run</code>, and{" "}
              <code>docs.nvoke.run</code>.
            </p>
            <p>
              For any privacy question, or to exercise the rights described in
              Section 8, contact us at{" "}
              <Placeholder>[privacy@nvoke.run]</Placeholder>.
            </p>
          </Section>

          <Section title="2. What data we collect">
            <p>We collect only what we need to run the service. Specifically:</p>
            <List>
              <li>
                <strong>Account data</strong> — name, email, and authentication
                identifiers, handled by our authentication provider (Clerk).
              </li>
              <li>
                <strong>Function code &amp; configuration</strong> — the
                JavaScript you author, environment variables, dependencies,
                HTTP configuration, schedules, and webhook settings.
              </li>
              <li>
                <strong>Invocation data</strong> — request inputs, responses,
                logs, timing, and error messages for functions you run.
              </li>
              <li>
                <strong>AI assistant data</strong> — when you use the in-editor
                AI assistant, we send your prompt, the current contents of the
                file you are editing, and your recent chat history for that
                function to our AI provider. See Section 5.
              </li>
              <li>
                <strong>Billing data</strong> — subscription plan and billing
                identifiers. Card details are handled by our payment processor
                and are not stored on our systems.
              </li>
              <li>
                <strong>Technical data</strong> — IP address, user-agent, and
                server logs necessary for security, abuse prevention, and
                debugging.
              </li>
            </List>
          </Section>

          <Section title="3. Legal basis for processing (GDPR Art. 6)">
            <List>
              <li>
                <strong>Performance of a contract</strong> — operating the
                service you signed up for (account, functions, invocations,
                billing).
              </li>
              <li>
                <strong>Legitimate interest</strong> — security, abuse
                prevention, service improvement, and basic product analytics.
              </li>
              <li>
                <strong>Legal obligation</strong> — tax, accounting, and
                statutory retention.
              </li>
              <li>
                <strong>Consent</strong> — where required (e.g. optional
                marketing emails or non-essential cookies), you can withdraw it
                at any time.
              </li>
            </List>
          </Section>

          <Section title="4. Sub-processors">
            <p>
              We use the following sub-processors. Each is bound by a data
              processing agreement (DPA) and processes your data only on our
              instructions.
            </p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse text-xs text-foreground/90">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Provider</th>
                    <th className="py-2 pr-4 font-medium">Purpose</th>
                    <th className="py-2 font-medium">Location</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  <tr>
                    <td className="py-2 pr-4">Clerk</td>
                    <td className="py-2 pr-4">
                      Authentication &amp; user management
                    </td>
                    <td className="py-2">United States</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4">Supabase</td>
                    <td className="py-2 pr-4">Managed Postgres &amp; storage</td>
                    <td className="py-2">
                      <Placeholder>[EU region — confirm]</Placeholder>
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4">
                      Coolify / self-hosted infrastructure
                    </td>
                    <td className="py-2 pr-4">
                      Application hosting &amp; function runtime
                    </td>
                    <td className="py-2">
                      <Placeholder>[Region of hosting provider]</Placeholder>
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4">OpenRouter</td>
                    <td className="py-2 pr-4">
                      AI model routing for the in-editor assistant
                    </td>
                    <td className="py-2">United States</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4">OpenAI</td>
                    <td className="py-2 pr-4">
                      Underlying LLM for the in-editor assistant
                    </td>
                    <td className="py-2">United States</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4">
                      <Placeholder>[Payment processor]</Placeholder>
                    </td>
                    <td className="py-2 pr-4">Subscription billing</td>
                    <td className="py-2">
                      <Placeholder>[Region]</Placeholder>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Section>

          <Section title="5. AI assistant (important)">
            <p>
              nvoke includes an optional AI assistant inside the function
              editor. The assistant is <strong>off by default</strong> — it
              only runs when you open the AI panel and send a prompt.
            </p>
            <p>
              When you send a message, the following data leaves our
              infrastructure:
            </p>
            <List>
              <li>The text of your prompt.</li>
              <li>The current contents of the file you are editing.</li>
              <li>Your recent chat history for that function.</li>
            </List>
            <p>
              This data is transmitted to <strong>OpenRouter</strong> (United
              States), which forwards it to <strong>OpenAI</strong> (United
              States) for inference. Model responses are streamed back to you
              in real time.
            </p>
            <p>
              <strong>Training.</strong> We use these providers with their API
              / zero-retention settings enabled. Your prompts, code, and chat
              history <strong>are not used to train AI models</strong>, and are
              not retained by the providers beyond what is required to return a
              response (subject to each provider&rsquo;s published retention
              policy for abuse monitoring).
            </p>
            <p>
              <strong>What to avoid sending.</strong> Because prompts and file
              contents are transmitted outside the EU, we recommend not pasting
              real customer data, end-user personal data, API keys, or other
              secrets into the editor while the AI assistant is enabled. The
              editor displays a warning to this effect, and the API rejects
              requests that contain recognised secret formats.
            </p>
          </Section>

          <Section title="6. International data transfers">
            <p>
              Some of our sub-processors (notably Clerk, OpenRouter, and
              OpenAI) are based in the United States. Transfers of personal
              data to the United States are covered by one or both of the
              following mechanisms, as set out in each provider&rsquo;s DPA:
            </p>
            <List>
              <li>
                The EU&ndash;US Data Privacy Framework (where the provider is
                certified), and/or
              </li>
              <li>
                The European Commission&rsquo;s Standard Contractual Clauses
                (2021/914), supplemented by a transfer impact assessment.
              </li>
            </List>
            <p>
              You can request a copy of the transfer mechanism in place for
              any sub-processor by contacting us at{" "}
              <Placeholder>[privacy@nvoke.run]</Placeholder>.
            </p>
          </Section>

          <Section title="7. Retention">
            <List>
              <li>
                <strong>Account data</strong> — kept while your account is
                active, deleted within 30 days of account closure except where
                retention is required by law.
              </li>
              <li>
                <strong>Function code &amp; versions</strong> — kept for the
                lifetime of the function; deleted when you delete the function.
              </li>
              <li>
                <strong>Invocation logs</strong> — kept for the retention
                window of your current plan, then deleted.
              </li>
              <li>
                <strong>AI prompts &amp; responses</strong> — displayed in the
                chat panel for the current session only; we do not persist them
                on our servers beyond short-term technical logs for abuse
                prevention.
              </li>
              <li>
                <strong>Billing records</strong> — retained for 5 years as
                required by Danish accounting law.
              </li>
            </List>
          </Section>

          <Section title="8. Your rights (GDPR Ch. III)">
            <p>You have the right to:</p>
            <List>
              <li>Access the personal data we hold about you.</li>
              <li>Request correction of inaccurate data.</li>
              <li>Request deletion (&ldquo;right to be forgotten&rdquo;).</li>
              <li>Export your data in a portable format.</li>
              <li>Object to or restrict certain processing.</li>
              <li>Withdraw consent where processing is based on consent.</li>
              <li>
                Lodge a complaint with the Danish Data Protection Authority
                (Datatilsynet) at{" "}
                <a
                  href="https://www.datatilsynet.dk"
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-primary hover:underline"
                >
                  datatilsynet.dk
                </a>
                .
              </li>
            </List>
            <p>
              To exercise any of these rights, email{" "}
              <Placeholder>[privacy@nvoke.run]</Placeholder>. We respond within
              30 days.
            </p>
          </Section>

          <Section title="9. Security">
            <p>
              Data is encrypted in transit (TLS) and at rest. Access to
              production systems is restricted to authorised personnel and uses
              two-factor authentication. Secrets stored in function environment
              variables are encrypted at rest.
            </p>
          </Section>

          <Section title="10. Changes">
            <p>
              We may update this policy. Material changes will be announced
              in-app or by email. Non-material changes (wording, clarifications)
              will be reflected by the &ldquo;Last updated&rdquo; date above.
            </p>
          </Section>

          <Section title="11. Contact">
            <p>
              Privacy questions: <Placeholder>[privacy@nvoke.run]</Placeholder>
              <br />
              Data controller:{" "}
              <Placeholder>[Legal entity, CVR, address]</Placeholder>
            </p>
          </Section>
        </div>
      </article>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold tracking-tight text-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}

function List({ children }: { children: React.ReactNode }) {
  return <ul className="ml-5 list-disc space-y-2">{children}</ul>;
}

function Placeholder({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded border border-primary/30 bg-primary/5 px-1.5 py-0.5 font-mono text-[11px] text-primary">
      {children}
    </span>
  );
}
