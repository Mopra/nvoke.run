import type { Metadata } from 'next';
import { SignIn } from '@clerk/nextjs';
import { AuthFrame } from '@/components/site/auth-frame';

export const metadata: Metadata = { title: 'Sign in', robots: { index: false, follow: true } };

export default function SignInPage() {
  return (
    <AuthFrame title="Welcome back" lede="Sign in to your searches.">
      <SignIn path="/sign-in" routing="path" signUpUrl="/sign-up" fallbackRedirectUrl="/app" />
    </AuthFrame>
  );
}
