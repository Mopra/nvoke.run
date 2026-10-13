import { clerkMiddleware } from '@clerk/nextjs/server';

// Clerk runs only on the desktop sign-in pages. Everything else (the marketing
// pages) stays static and never touches Clerk.
export default clerkMiddleware();

export const config = {
  matcher: ['/desktop/:path*'],
};
