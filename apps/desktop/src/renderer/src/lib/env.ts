export const env = {
  /** VITE_MOCK=1 runs the renderer on fake data, without the main process bridge. */
  mock: import.meta.env['VITE_MOCK'] === '1',
  /** The marketing site, where billing and checkout happen. */
  siteUrl: (import.meta.env['VITE_SITE_URL'] as string | undefined) || (import.meta.env.PROD ? 'https://nvoke.run' : 'http://localhost:3001'),
};

/** The site page where people pick a plan and pay. Opens in the system browser. */
export const BILLING_URL = `${env.siteUrl.replace(/\/$/, '')}/desktop/billing`;
