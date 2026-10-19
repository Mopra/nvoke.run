import type { Metadata } from 'next';
import { SignIn } from '@clerk/nextjs';
import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { CLERK_APPEARANCE_UNTITLED } from '@/components/app/clerk-appearance';
import { AT_SIGN, DotField } from '@/components/site/auth/dot-field';
import { LogoLoader } from '@/components/app/motion';
import { AuthFrame } from '@/components/site/auth-frame';

export const metadata: Metadata = { title: 'Sign in', robots: { index: false, follow: true } };

// Clerk renders nothing for a visitor who is already signed in, so send them on.
export default async function SignInPage() {
  if ((await auth()).userId) redirect('/app');
  return (
    <AuthFrame title="Welcome back" lede="Your searches and leads are where you left them." label="Sign in" display={
        <figure>
          <DotField pattern={AT_SIGN} />
          <figcaption className="mt-6 grid grid-cols-3 gap-4 border-t pt-4">
            <span className="cap text-foreground">Your leads</span>
            <span className="cap text-muted-foreground">Kept 12 months</span>
            <span className="cap text-right text-primary">Welcome back</span>
          </figcaption>
        </figure>
      }
    >
      <SignIn appearance={CLERK_APPEARANCE_UNTITLED} fallback={<LogoLoader label="Loading sign in" />} path="/sign-in" routing="path" signUpUrl="/sign-up" fallbackRedirectUrl="/app" />
    </AuthFrame>
  );
}
