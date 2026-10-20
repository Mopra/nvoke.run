import type { Metadata } from 'next';
import { CampaignScreen } from '@/components/app/sending/campaign-screen';

export const metadata: Metadata = { title: 'Campaign' };

/** `?lead=` opens that lead, as Replies links to it. */
export default async function CampaignPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ lead?: string | string[] }>;
}) {
  const { id } = await params;
  const { lead } = await searchParams;
  return <CampaignScreen key={id} id={id} lead={typeof lead === 'string' ? lead : undefined} />;
}
