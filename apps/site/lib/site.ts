export const site = {
  name: 'nvoke',
  tagline: 'A lead finder that lives on your desktop.',
  description:
    'nvoke is a desktop app for Windows, macOS and Linux. It finds companies, reads their websites and gives you business email addresses that are checked to receive mail.',
  url: process.env['NEXT_PUBLIC_SITE_URL'] ?? 'https://nvoke.run',
  botUserAgent: 'nvokebot/1.0 (+https://nvoke.run/bot)',
  email: {
    hello: 'hello@nvoke.run',
    privacy: 'privacy@nvoke.run',
    bot: 'bot@nvoke.run',
  },
  // Placeholder company details for the legal pages. Fill in before launch.
  // Fields left as null are not shown.
  company: {
    legalName: 'nvoke ApS',
    cvr: null as string | null,
    address: null as string | null,
    country: 'Denmark',
  },
};

export const nav = [
  { href: '/#how-it-works', label: 'How it works' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/bot', label: 'nvokebot' },
];

export const footerNav = [
  { href: '/pricing', label: 'Pricing' },
  { href: '/download', label: 'Download' },
  { href: '/bot', label: 'nvokebot' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms' },
];
