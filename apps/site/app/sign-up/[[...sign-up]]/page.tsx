import type { Metadata } from 'next';
import { SignUp } from '@clerk/nextjs';
import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { CLERK_APPEARANCE } from '@/components/app/clerk-appearance';
import { LogoLoader } from '@/components/app/motion';
import { AuthFrame } from '@/components/site/auth-frame';
import { PLANS } from '@nvoke/shared';

export const metadata: Metadata = {
  title: 'Start free',
  description: `Find companies and emails that work, in your browser. ${PLANS.free.emailsPerMonth} verified emails a month free, no card.`,
};

// Clerk renders nothing for a visitor who is already signed in, so send them on.
export default async function SignUpPage() {
  if ((await auth()).userId) redirect('/app');
  return (
    <AuthFrame
      title="Start free"
      label="Sign up"
      lede={`${PLANS.free.emailsPerMonth} verified emails a month, no card. Runs in your browser, nothing to install.`}
    >
      <SignUp appearance={CLERK_APPEARANCE} fallback={<LogoLoader label="Loading sign up" />} path="/sign-up" routing="path" signInUrl="/sign-in" fallbackRedirectUrl="/app" />
    </AuthFrame>
  );
}
