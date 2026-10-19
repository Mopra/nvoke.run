import type { Metadata } from 'next';
import { SignIn } from '@clerk/nextjs';
import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { CLERK_APPEARANCE_UNTITLED } from '@/components/app/clerk-appearance';
import { LiveSearch } from '@/components/mockups/live-search';
import { LogoLoader } from '@/components/app/motion';
import { AuthFrame } from '@/components/site/auth-frame';

export const metadata: Metadata = { title: 'Sign in', robots: { index: false, follow: true } };

// Clerk renders nothing for a visitor who is already signed in, so send them on.
export default async function SignInPage() {
  if ((await auth()).userId) redirect('/app');
  return (
    <AuthFrame title="Welcome back" lede="Your searches and leads are where you left them." label="Sign in" display={<LiveSearch large />}>
      <SignIn appearance={CLERK_APPEARANCE_UNTITLED} fallback={<LogoLoader label="Loading sign in" />} path="/sign-in" routing="path" signUpUrl="/sign-up" fallbackRedirectUrl="/app" />
    </AuthFrame>
  );
}
