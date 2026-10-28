# Search kinds

| kind | user gives | where companies come from |
|---|---|---|
| `local` | niche + location, e.g. "dentists" + "Copenhagen" | OpenStreetMap: Nominatim to resolve the location to a bounding box, Overpass to find matching businesses (by tag and name) that have a `website`. Free, no key. When those fall short of the limit, places that match the niche by tag but list no website are looked up on Brave as "<name> <city>" (`addr:city`, else the location) in the place's country, one request each through the same cache as `web`, at most 50 per search (`MAX_PLACE_LOOKUPS`), skipping names already found or looked up (a chain has one site). The result that is the place's own site is crawled: not a platform, directory, webmail or .edu/.gov domain, and its brand label is the name run together, holds every distinctive word of the name or two long ones (the niche's words, their plurals, the city and stop words left out; a one word name must start the label), see `pickPlaceSite` in `@nvoke/shared/crawl`. There is no fall back to the top result, so a place without a matching result is skipped. `docs/research/crawl-benchmark.md` measures it. The public Overpass instances (`OVERPASS_URL`, six by default) are often busy or down: a query tries each in turn, then two more rounds after 5 and 20 seconds, within 5 minutes. When they all stay down, or all of that finds fewer places than the limit, a Brave web search for "<niche> in <location>" (scoped to the place's country) fills the rest, with the same costs and rules as `web`. An unknown location still fails with `location_not_found`. |
| `web` | keyword, optional country | Brave Search API (`BRAVE_SEARCH_API_KEY`), with Mwmbl as the free fallback (`FREE_SEARCH`). Take result domains, drop big platforms (social networks, marketplaces, Wikipedia, news). Paid per request, see [Source costs](source-costs.md). |
| `launches` | optional keyword filter, time window | Product Hunt and Hacker News "Show HN" (port from `../probe/apps/worker/src/sources`). |
| `domains` | a list: domains, URLs, email addresses or company names, up to the search limit, optional country | The list itself. Domains (and the domain of an email address) go straight to the crawl, at no cost; webmail addresses are skipped. Each name costs one Brave request (the first result page, through the same cache, rate limit and refusal rules as `web`, see [Source costs](source-costs.md)); platform and webmail domains are dropped and the result whose domain looks most like the name wins (legal words such as ApS and Inc ignored, æ ø å folded), else the first usable one of the top 3, else the name is skipped. `splitList` in `packages/shared/src/lists.ts` turns pasted text into items. |
| `drop` | nothing: a drop makes it (see [Drops](drops.md)) | The feed the worker collects around the clock. |
| `icp` | Sonar ([Describe your customer](sonar.md)): who they sell to in plain words (`description`), optionally what they sell (`product`), `countries` and `locations` | A plan Claude makes from the words, run on Brave, on the list pages it finds and on OpenStreetMap, each candidate given a first look for fit and, when its crawl found someone to check, a second look after the crawl. See [Describe your customer](sonar.md). |

Each source is an adapter with the same interface, so more can be added later:

```ts
interface SourceAdapter<P> {
  kind: SearchKind
  find(params: P, ctx: { limit: number; signal: AbortSignal; log: Logger }): AsyncIterable<FoundCompany>
}
type FoundCompany = { name: string; website: string; source: string; sourceRef?: string; location?: string; phone?: string; category?: string; fit?: number; fitReason?: string; title?: string; snippet?: string }
```
