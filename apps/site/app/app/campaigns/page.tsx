import type { Metadata } from 'next';
import { SendingGate } from '@/components/app/sending/gate';
import { CampaignsScreen } from '@/components/app/sending/campaigns-screen';

export const metadata: Metadata = { title: 'Campaigns' };

export default function CampaignsPage() {
  return (
    <SendingGate>
      <CampaignsScreen />
    </SendingGate>
  );
}
