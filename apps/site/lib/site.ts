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
  // Operator details for the legal pages. nvoke is not a company, so there is
  // no registration number. Fields left as null are not shown.
  // TODO(owner): fill in the postal address before launch. The privacy policy
  // and terms need a contact address for the data controller.
  company: {
    legalName: 'nvoke',
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
  { href: '/opt-out', label: 'Opt out' },
  { href: '/terms', label: 'Terms' },
];
