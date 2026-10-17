/** The free tools on nvoke.run/tools. No sign-in, rate limited per network. */
export type ToolSlug = 'email-verifier' | 'website-email-extractor' | 'spf-dmarc-checker';

export type Tool = {
  slug: ToolSlug;
  href: `/tools/${ToolSlug}`;
  /** Page and card title. */
  name: string;
  /** Label in the row of tool links. */
  short: string;
  /** One line for the card and the index. */
  description: string;
};

export const tools: Tool[] = [
  {
    slug: 'email-verifier',
    href: '/tools/email-verifier',
    name: 'Email verifier',
    short: 'Email verifier',
    description: 'Ask the mail server if an address exists. Nothing gets sent.',
  },
  {
    slug: 'website-email-extractor',
    href: '/tools/website-email-extractor',
    name: 'Website email extractor',
    short: 'Email extractor',
    description: 'Read a company’s website and list the email addresses it publishes.',
  },
  {
    slug: 'spf-dmarc-checker',
    href: '/tools/spf-dmarc-checker',
    name: 'SPF and DMARC checker',
    short: 'SPF and DMARC',
    description: 'Grade a domain’s MX, SPF, DMARC and DKIM records in one go.',
  },
];

export function toolBySlug(slug: ToolSlug): Tool {
  const tool = tools.find((t) => t.slug === slug);
  if (!tool) throw new Error(`Unknown tool ${slug}`);
  return tool;
}

/** Sign-up link with the UTM tags the tool pages use. */
export function signUpHref(medium: 'tool_result' | 'tool_footer', campaign: ToolSlug | 'tools'): string {
  const q = new URLSearchParams({ utm_source: 'tools', utm_medium: medium, utm_campaign: campaign });
  return `/sign-up?${q.toString()}`;
}

/**
 * Open Graph for a tools page. A page that sets openGraph replaces the
 * layout's, so the site name and the shared image are repeated here.
 */
export function toolOpenGraph(title: string, description: string, url: string) {
  return {
    title,
    description,
    url,
    type: 'website' as const,
    siteName: 'nvoke',
    images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: 'nvoke: Find companies. Get emails that actually work.' }],
  };
}
