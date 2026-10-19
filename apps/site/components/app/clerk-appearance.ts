/**
 * Clerk's sign in, sign up and checkout in the site's parts: no card, the
 * form sits on the paper between hairlines, the primary button the dark
 * keycap, the social buttons light keycaps, the fields recessed, the labels
 * printed in mono capitals. Colors
 * come from the theme's CSS variables only, so both finishes follow.
 * Classes carry `!` because Clerk's own styles load after the site's.
 */
export const CLERK_APPEARANCE = {
  variables: {
    colorPrimary: 'var(--primary)',
    colorPrimaryForeground: 'var(--primary-foreground)',
    colorBackground: 'var(--card)',
    colorForeground: 'var(--card-foreground)',
    colorMuted: 'var(--secondary)',
    colorNeutral: 'var(--foreground)',
    colorMutedForeground: 'var(--muted-foreground)',
    colorInput: 'var(--card)',
    colorInputForeground: 'var(--foreground)',
    colorBorder: 'var(--border)',
    colorRing: 'var(--ring)',
    colorDanger: 'var(--destructive)',
    colorSuccess: 'var(--chart-1)',
    colorWarning: 'var(--chart-2)',
    borderRadius: '4px',
    fontFamily: 'var(--font-sans)',
    fontFamilyButtons: 'var(--font-mono)',
  },
  elements: {
    rootBox: 'w-full max-w-[400px]',
    cardBox: 'w-full! max-w-none! rounded-none! shadow-none! border-0! border-t! border-border! bg-transparent!',
    card: 'bg-transparent! shadow-none! rounded-none! border-0! px-0! pt-7! pb-6!',
    footer: 'bg-none! bg-transparent! border-t! border-border! [&_*]:font-sans [&>div]:px-0!',
    headerTitle: 'font-display! text-[22px]! font-light! tracking-[-0.01em]!',
    headerSubtitle: 'text-muted-foreground!',
    formFieldLabel: 'cap! text-muted-foreground!',
    formFieldInput:
      'h-9! rounded-[4px]! border-0! bg-card! font-mono! text-[13px]! shadow-[inset_0_1px_2px_var(--shadow-strong),inset_0_0_0_1px_var(--border)]! focus:shadow-[inset_0_1px_2px_var(--shadow-strong),0_0_0_3px_color-mix(in_oklab,var(--ring)_40%,transparent)]!',
    formButtonPrimary:
      'key h-9! rounded-[4px]! border-0! bg-foreground! font-mono! text-[12px]! font-medium! tracking-[0.07em]! text-background! uppercase! hover:brightness-110! after:hidden! before:hidden!',
    socialButtonsBlockButton:
      'key h-9! rounded-[4px]! border-0! bg-secondary! text-secondary-foreground! hover:brightness-[0.97]!',
    socialButtonsBlockButtonText: 'font-mono! text-[12px]! font-medium! tracking-[0.07em]! uppercase!',
    socialButtonsIconButton: 'key rounded-[4px]! border-0! bg-secondary! hover:brightness-[0.97]!',
    dividerLine: 'bg-border!',
    dividerText: 'cap! text-muted-foreground!',
    footerActionText: 'text-muted-foreground!',
    footerActionLink: 'text-foreground! underline-offset-4 hover:underline!',
    identityPreview: 'rounded-[4px]! bg-secondary! border-0!',
    otpCodeFieldInput: 'rounded-[4px]! bg-card! font-mono! shadow-[inset_0_1px_2px_var(--shadow-strong),inset_0_0_0_1px_var(--border)]! border-0!',
    badge: 'cap! rounded-[3px]!',
  },
} as const;

/** The same, with Clerk's own heading hidden: for pages that print their own title over the form. */
export const CLERK_APPEARANCE_UNTITLED = {
  ...CLERK_APPEARANCE,
  elements: {
    ...CLERK_APPEARANCE.elements,
    rootBox: 'w-full! max-w-[400px]!',
    header: 'hidden!',
    card: `${CLERK_APPEARANCE.elements.card} w-full! pt-6!`,
  },
};
