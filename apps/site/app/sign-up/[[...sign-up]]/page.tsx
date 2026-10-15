import type { Metadata } from 'next';
import { SignUp } from '@clerk/nextjs';
import { AuthFrame } from '@/components/site/auth-frame';
import { PLANS } from '@nvoke/shared';

export const metadata: Metadata = {
  title: 'Start free',
  description: `Find companies and emails that work, in your browser. ${PLANS.free.emailsPerMonth} verified emails a month free, no card.`,
};

export default function SignUpPage() {
  return (
    <AuthFrame
      title="Start free"
      lede={`${PLANS.free.emailsPerMonth} verified emails a month, no card. Runs in your browser, nothing to install.`}
    >
      <SignUp path="/sign-up" routing="path" signInUrl="/sign-in" fallbackRedirectUrl="/app" />
    </AuthFrame>
  );
}
