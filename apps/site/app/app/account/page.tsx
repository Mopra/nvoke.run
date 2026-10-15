import type { Metadata } from 'next';
import { AccountScreen } from '@/components/app/account-screen';

export const metadata: Metadata = { title: 'Account' };

export default function AccountPage() {
  return <AccountScreen />;
}
