export const env = {
  clerkPublishableKey: (import.meta.env['VITE_CLERK_PUBLISHABLE_KEY'] as string | undefined) || undefined,
  apiUrl: (import.meta.env['VITE_API_URL'] as string | undefined) || 'http://localhost:3000',
};
