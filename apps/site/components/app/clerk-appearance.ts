/**
 * Clerk's sign in, sign up and checkout in the panel's parts: the card is a
 * plate, the primary button the one orange keycap, the social buttons light
 * keycaps, the fields recessed, the labels printed in mono capitals. Colors
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
    cardBox: 'w-full! max-w-none! rounded-[8px]! shadow-(--shadow-plate)! border-0!',
    card: 'bg-card! shadow-none! rounded-[8px]! px-6! py-7! sm:px-8!',
    footer: 'bg-none! bg-background/40! [&_*]:font-sans',
    headerTitle: 'font-display! text-[22px]! font-light! tracking-[-0.01em]!',
    headerSubtitle: 'text-muted-foreground!',
    formFieldLabel: 'cap! text-muted-foreground!',
    formFieldInput:
      'h-9! rounded-[4px]! border-0! bg-card! font-mono! text-[13px]! shadow-[inset_0_1px_2px_var(--shadow-strong),inset_0_0_0_1px_var(--border)]! focus:shadow-[inset_0_1px_2px_var(--shadow-strong),0_0_0_3px_color-mix(in_oklab,var(--ring)_40%,transparent)]!',
    formButtonPrimary:
      'key key-primary h-9! rounded-[4px]! border-0! bg-primary! font-mono! text-[12px]! font-medium! tracking-[0.07em]! text-primary-foreground! uppercase! hover:brightness-110! after:hidden! before:hidden!',
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
