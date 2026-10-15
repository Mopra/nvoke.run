import type { Metadata } from 'next';
import { AppBilling } from '@/components/app/app-billing';

export const metadata: Metadata = { title: 'Plan and billing' };

export default function AppBillingPage() {
  return <AppBilling />;
}
