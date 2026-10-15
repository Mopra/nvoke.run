import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

const isApp = createRouteMatcher(['/app(.*)']);

// Clerk runs only on the web app, sign in and sign up, the desktop sign-in
// and billing pages and /claim. Everything else (the marketing pages and the
// docs) stays static and never touches Clerk. The web app needs a session:
// a signed-out visitor goes to /sign-in and comes back after.
export default clerkMiddleware(
  async (auth, req) => {
    if (isApp(req)) await auth.protect();
  },
  { signInUrl: '/sign-in', signUpUrl: '/sign-up' },
);

export const config = {
  matcher: ['/desktop/:path*', '/claim', '/app/:path*', '/sign-in/:path*', '/sign-up/:path*'],
};
