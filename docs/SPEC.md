# nvoke v1 spec

nvoke is a lead finder sold to paying customers. A web app at nvoke.run/app is the front door (see [Web app](spec/web-app.md)), nvoke Desktop (Electron) is the premium native app with the power tools, and the same features are open to code and AI agents through a REST API and an MCP server (see [API and agents](spec/api-and-agents.md)). The user starts a search, the backend on our VPS finds companies, crawls their websites, extracts email addresses and checks that they can receive mail. The user browses, filters and exports the results.

One file per area in `docs/spec/`. Read the one you touch; edit it in place.

- [Search kinds](spec/search-kinds.md): The six search kinds, where their companies come from, and the source adapter interface.
- [Pipeline per search](spec/pipeline.md): Find, crawl, verify and people steps, check policy, and how a search grows over runs.
- [Data model](spec/data-model.md): Every Postgres table and its columns (public schema, RLS on with no policies).
- [API](spec/api.md): The `/v1` routes (Fastify) and what each one does, plus the routes outside `/v1`.
- [API and agents](spec/api-and-agents.md): The catalog, credentials, API keys, agent sign-up, claiming and the MCP server.
- [Drops](spec/drops.md): The launch feed and daily drops.
- [Webhooks](spec/webhooks.md): Leads pushed to the user's URL: events, payload, signing, delivery and safety.
- [Local render crawl](spec/local-render-crawl.md): The desktop reads sites the server crawl could not.
- [Plans](spec/plans.md): The plan ladder, what counts as a verified email, quota and Clerk Billing.
- [Sonar (Describe your customer)](spec/sonar.md): The `icp` kind: plan, company index, tiers, list pages, job posts, fit, budgets and ongoing rounds.
- [Source costs](spec/source-costs.md): Paid web search: providers, cache, rate, refusals, free search, alerts and free name lookup.
- [Claude](spec/claude.md): Claude calls through OpenRouter, the monthly budget, and the account's own Claude and search keys.
- [Site profile](spec/site-profile.md): Start from your website: read the site, build a profile and suggest searches.
- [Openers](spec/openers.md): One drafted first line per company, grounded in a quote from its site.
- [Desktop screens](spec/desktop-screens.md): The desktop app's screens, with links to each feature page in `docs/desktop/`.
- [Web app](spec/web-app.md): The screens of the web app at nvoke.run/app.
- [Website](spec/website.md): The pages of nvoke.run.
- [Free tools](spec/free-tools.md): The public verifier, extractor and SPF and DMARC checker, and their limits.
- [Privacy](spec/privacy.md): Positioning, legal basis, collection, suppression, retention and rights.
