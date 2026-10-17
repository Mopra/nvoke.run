import type { Metadata } from 'next';
import { WebsiteScreen } from '@/components/app/site-profile';

export const metadata: Metadata = { title: 'Your website' };

/** The website read on file, or the one running: its profile and the searches it planned. */
export default function WebsitePage() {
  return <WebsiteScreen />;
}
