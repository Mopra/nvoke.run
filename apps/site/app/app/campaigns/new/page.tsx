import type { Metadata } from 'next';
import { CampaignNew } from '@/components/app/sending/campaign-new';

export const metadata: Metadata = { title: 'New campaign' };

/** `?search=` or `?drop=` opens the form on that source. */
export default async function NewCampaignPage({ searchParams }: { searchParams: Promise<{ search?: string | string[]; drop?: string | string[] }> }) {
  const { search, drop } = await searchParams;
  const pick = typeof drop === 'string' ? ({ kind: 'drop', id: drop } as const) : typeof search === 'string' ? ({ kind: 'search', id: search } as const) : null;
  return <CampaignNew pick={pick} />;
}
