import { clerkMiddleware } from '@clerk/nextjs/server';

// Clerk runs only on the desktop sign-in and billing pages and on /claim.
// Everything else (the marketing pages and the docs) stays static and never
// touches Clerk.
export default clerkMiddleware();

export const config = {
  matcher: ['/desktop/:path*', '/claim'],
};
