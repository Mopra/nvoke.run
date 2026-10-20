import type { Metadata } from 'next';
import { CampaignsScreen } from '@/components/app/sending/campaigns-screen';

export const metadata: Metadata = { title: 'Campaigns' };

export default function CampaignsPage() {
  return <CampaignsScreen />;
}
