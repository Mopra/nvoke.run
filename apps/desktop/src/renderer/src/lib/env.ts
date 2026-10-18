export const env = {
  /** VITE_MOCK=1 runs the renderer on fake data, without the main process bridge. */
  mock: import.meta.env['VITE_MOCK'] === '1',
  /** VITE_FILM=1 swaps the mock's demo data for the product film's cast (lib/mock/film.ts). */
  film: import.meta.env['VITE_FILM'] === '1',
  /** The marketing site, where billing and checkout happen. */
  siteUrl: (import.meta.env['VITE_SITE_URL'] as string | undefined) || (import.meta.env.PROD ? 'https://nvoke.run' : 'http://localhost:3001'),
  /** apps/server. The renderer never calls it; it only shows it, for the API and MCP setup lines. */
  apiUrl: (import.meta.env['VITE_API_URL'] as string | undefined) || (import.meta.env.PROD ? 'https://api.nvoke.run' : 'http://localhost:3000'),
};

/** The MCP server. Agents connect here with an API key. */
export const MCP_URL = `${env.apiUrl.replace(/\/$/, '')}/mcp`;

/** API and MCP docs on the site. */
export const DOCS_URL = `${env.siteUrl.replace(/\/$/, '')}/docs`;
export const API_DOCS_URL = `${DOCS_URL}/api`;
export const MCP_DOCS_URL = `${DOCS_URL}/mcp`;
export const WEBHOOK_DOCS_URL = `${DOCS_URL}/webhooks`;

/** The site page where people pick a plan and pay. Opens in the system browser. */
export const BILLING_URL = `${env.siteUrl.replace(/\/$/, '')}/desktop/billing`;

/** The terms of use, including the customer's responsibility for lawful outreach. */
export const TERMS_URL = `${env.siteUrl.replace(/\/$/, '')}/terms`;
