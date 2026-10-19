import type { Metadata } from 'next';
import { DropScreen } from '@/components/app/drops/drop-screen';

export const metadata: Metadata = { title: 'New drop' };

/** `?keyword=` starts the drop with that keyword filled in. */
export default async function NewDropPage({ searchParams }: { searchParams: Promise<{ keyword?: string | string[] }> }) {
  const { keyword } = await searchParams;
  return <DropScreen id={null} keyword={typeof keyword === 'string' ? keyword : undefined} />;
}
