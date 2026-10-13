import type { Metadata } from 'next';
import { ERROR_CODES, type Endpoint } from '@nvoke/shared';
import { CodeBlock } from '@/components/docs/code-block';
import { DocsSection, DocsTitle, Inline, Prose } from '@/components/docs/prose';
import { AUTH_LABEL, anchorOf, curlFor, endpointGroups, fieldGroups, urls, type FieldGroup } from '@/lib/docs';
import { cn } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'REST API',
  description: 'The nvoke REST API: searches, leads, CSV export, webhooks, API keys and agent sign-up. Every endpoint with its fields.',
  alternates: { canonical: '/docs/api' },
};

const METHOD_TONE: Record<Endpoint['method'], string> = {
  GET: 'bg-foreground/[0.07] text-foreground',
  POST: 'bg-primary/12 text-primary',
  PATCH: 'bg-primary/12 text-primary',
  DELETE: 'bg-destructive/12 text-destructive',
};

function Method({ method }: { method: Endpoint['method'] }) {
  return (
    <span className={cn('inline-flex h-6 items-center rounded-full px-2.5 font-mono text-[11px] font-semibold tracking-wide', METHOD_TONE[method])}>
      {method}
    </span>
  );
}

function Fields({ title, groups }: { title: string; groups: FieldGroup[] }) {
  return (
    <div className="flex flex-col gap-3">
      <h4 className="text-sm font-medium">{title}</h4>
      {groups.map((g, i) => (
        <div key={g.label ?? i} className="flex flex-col gap-2">
          {g.label ? <p className="font-mono text-xs text-muted-foreground">{g.label}</p> : null}
          <div className="overflow-x-auto rounded-2xl border">
            <table className="w-full min-w-[34rem] text-left text-sm">
              <tbody className="divide-y">
                {g.fields.map((f) => (
                  <tr key={f.name} className="align-top">
                    <td className="w-48 py-2.5 pr-3 pl-4 font-mono text-[13px] break-all text-foreground">
                      {f.name}
                      {f.required ? null : <span className="text-muted-foreground">?</span>}
                    </td>
                    <td className="w-44 py-2.5 pr-3 font-mono text-[12px] break-words text-muted-foreground">{f.type}</td>
                    <td className="py-2.5 pr-4 text-[13px] text-muted-foreground">{f.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

function EndpointBlock({ e }: { e: Endpoint }) {
  const response = e.response !== null && e.response !== 'csv' ? fieldGroups(e.response, 'output') : null;
  const errors = [...(e.auth === 'public' ? [] : ['unauthorized']), ...e.errors];
  return (
    <section id={anchorOf(e)} className="flex scroll-mt-28 flex-col gap-5 border-t py-10">
      <div className="flex flex-col gap-3">
        <h3 className="text-xl font-semibold tracking-[-0.02em]">{e.summary}</h3>
        <div className="flex flex-wrap items-center gap-2">
          <Method method={e.method} />
          <code className="font-mono text-sm break-all">{e.path}</code>
          <span className="rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground">{AUTH_LABEL[e.auth]}</span>
        </div>
      </div>
      <Prose>
        <p>
          <Inline text={e.description} />
        </p>
      </Prose>
      {e.query ? <Fields title="Query" groups={fieldGroups(e.query, 'input')} /> : null}
      {e.body ? <Fields title="Body" groups={fieldGroups(e.body, 'input')} /> : null}
      <CodeBlock label="shell" code={curlFor(e)} />
      {response ? (
        <details className="group">
          <summary className="w-fit cursor-pointer list-none rounded-full text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40 [&::-webkit-details-marker]:hidden">
            <span className="group-open:hidden">Show the {e.status} response</span>
            <span className="hidden group-open:inline">Hide the response</span>
          </summary>
          <div className="mt-4">
            <Fields title={`${e.status} response`} groups={response} />
          </div>
        </details>
      ) : (
        <p className="text-sm text-muted-foreground">
          Returns {e.status} {e.response === 'csv' ? 'with text/csv.' : 'with no body.'}
        </p>
      )}
      {errors.length > 0 ? (
        <p className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
          Errors:
          {errors.map((code) => (
            <a key={code} href={`#error-${code}`} className="rounded-md bg-foreground/[0.06] px-1.5 py-0.5 font-mono text-[12px] text-foreground hover:bg-foreground/10">
              {code}
            </a>
          ))}
        </p>
      ) : null}
    </section>
  );
}

export default function ApiDocs() {
  const groups = endpointGroups();
  return (
    <>
      <DocsTitle
        title="REST API"
        intro="JSON over HTTPS. One bearer key. The same routes the desktop app uses, so nothing here is second class."
      />

      <div className="glass flex flex-col gap-3 rounded-3xl p-6 text-sm">
        <div className="grid gap-1 sm:grid-cols-[7rem_1fr]">
          <span className="text-muted-foreground">Base URL</span>
          <code className="font-mono break-all">{urls.apiBase}</code>
        </div>
        <div className="grid gap-1 sm:grid-cols-[7rem_1fr]">
          <span className="text-muted-foreground">Auth</span>
          <code className="font-mono break-all">Authorization: Bearer nvk_sk_...</code>
        </div>
        <div className="grid gap-1 sm:grid-cols-[7rem_1fr]">
          <span className="text-muted-foreground">OpenAPI</span>
          <a href={urls.openapi} className="font-mono break-all underline underline-offset-4">
            {urls.openapi}
          </a>
        </div>
      </div>

      <DocsSection id="auth" title="Authentication">
        <Prose>
          <p>
            Every route except the public ones wants <code>Authorization: Bearer</code> with an API key. Make keys in the
            desktop app under Account, or with <code>POST /v1/api-keys</code> once you hold one. An agent without an
            account gets its first key from <a href="/docs/agents">agent sign-up</a>.
          </p>
          <p>
            OAuth access tokens from nvoke’s sign-in work too. That is how MCP clients connect, see{' '}
            <a href="/docs/mcp">MCP</a>.
          </p>
        </Prose>
      </DocsSection>

      <DocsSection id="errors" title="Errors">
        <Prose>
          <p>
            Failures answer with a 4xx or 5xx status and <code>{'{ "error": "code" }'}</code>. Validation failures add{' '}
            <code>details</code>. Branch on the code, not on the message.
          </p>
        </Prose>
        <dl className="divide-y rounded-2xl border">
          {Object.entries(ERROR_CODES).map(([code, meaning]) => (
            <div key={code} id={`error-${code}`} className="grid scroll-mt-28 gap-1 px-4 py-3 sm:grid-cols-[12rem_1fr] sm:gap-4">
              <dt className="font-mono text-[13px]">{code}</dt>
              <dd className="text-sm text-muted-foreground">
                <Inline text={meaning} />
              </dd>
            </div>
          ))}
        </dl>
      </DocsSection>

      <nav aria-label="Endpoints" className="border-t py-12">
        <h2 className="pb-5 text-2xl font-semibold tracking-[-0.025em]">Endpoints</h2>
        <div className="grid gap-6 sm:grid-cols-2">
          {groups.map(({ group, endpoints }) => (
            <div key={group} className="flex flex-col gap-2">
              <h3 className="text-xs tracking-wide text-muted-foreground uppercase">{group}</h3>
              <ul className="flex flex-col gap-1.5">
                {endpoints.map((e) => (
                  <li key={e.id}>
                    <a href={`#${anchorOf(e)}`} className="group flex items-center gap-2 text-sm">
                      <Method method={e.method} />
                      <span className="font-mono text-[13px] break-all text-muted-foreground group-hover:text-foreground">{e.path}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </nav>

      {groups.map(({ group, endpoints }) => (
        <div key={group} className="pt-6">
          <h2 className="text-3xl font-semibold tracking-[-0.03em]">{group}</h2>
          {endpoints.map((e) => (
            <EndpointBlock key={e.id} e={e} />
          ))}
        </div>
      ))}
    </>
  );
}
