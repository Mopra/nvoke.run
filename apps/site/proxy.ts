import { NextResponse } from 'next/server';
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

const isApp = createRouteMatcher(['/app(.*)']);

// Clerk runs only on the web app, sign in and sign up, the desktop sign-in
// and billing pages and /claim. Everything else (the marketing pages and the
// docs) stays static and never touches Clerk. The web app needs a session:
// a signed-out visitor goes to /sign-in and comes back after.
export default clerkMiddleware(
  async (auth, req) => {
    if (!isApp(req)) return;
    // auth.protect() answers 404 to anything that does not look like a
    // browser navigation (curl, crawlers, link previews), so redirect by hand.
    const { userId } = await auth();
    if (!userId) {
      const url = new URL('/sign-in', req.url);
      url.searchParams.set('redirect_url', req.url);
      return NextResponse.redirect(url, 307);
    }
  },
  { signInUrl: '/sign-in', signUpUrl: '/sign-up' },
);

export const config = {
  matcher: ['/desktop/:path*', '/claim', '/app/:path*', '/sign-in/:path*', '/sign-up/:path*'],
};
