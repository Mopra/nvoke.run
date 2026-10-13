export const site = {
  name: 'nvoke',
  tagline: 'Find companies. Get emails that actually work.',
  description:
    'nvoke finds companies, reads their own websites and checks every email with the mail server. A desktop app for Windows, macOS and Linux.',
  url: process.env['NEXT_PUBLIC_SITE_URL'] ?? 'https://nvoke.run',
  botUserAgent: 'nvokebot/1.0 (+https://nvoke.run/bot)',
  email: {
    hello: 'hello@nvoke.run',
    privacy: 'privacy@nvoke.run',
    bot: 'bot@nvoke.run',
  },
  // The company behind nvoke, named only on the legal pages. Marketing copy
  // says "nvoke" and nothing else. Fields left as null are not shown.
  company: {
    legalName: 'Pradsgaard Labs',
    cvr: 'DK46156153' as string | null,
    address: 'Bogfinkevej 2, 7400 Herning' as string | null,
    country: 'Denmark',
  },
};

export const nav = [
  { href: '/#how-it-works', label: 'How it works' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/agents', label: 'Agents' },
  { href: '/docs', label: 'Docs' },
];

export const footerNav = [
  { href: '/pricing', label: 'Pricing' },
  { href: '/download', label: 'Download' },
  { href: '/agents', label: 'Agents' },
  { href: '/docs', label: 'Docs' },
  { href: '/bot', label: 'nvokebot' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/opt-out', label: 'Opt out' },
  { href: '/terms', label: 'Terms' },
];
