import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { formatNumber, relativeTime } from '@/lib/format';
import { useLocalStatus } from '@/lib/queries';
import { Setting } from './Setting';

/** What the local copy holds and when it last heard from the server. */
function LocalCopyDescription() {
  const { data: status } = useLocalStatus();
  if (!status) return <>Searches, companies and checked emails, kept on this computer.</>;
  const held =
    status.companies > 0
      ? `${formatNumber(status.companies)} companies and ${formatNumber(status.emails)} emails`
      : 'Your searches';
  const when = status.syncing
    ? 'syncing now'
    : status.online === false
      ? `offline${status.syncedAt ? `, last synced ${relativeTime(status.syncedAt)}` : ''}`
      : status.syncedAt
        ? `synced ${relativeTime(status.syncedAt)}`
        : 'not synced yet';
  return (
    <>
      {held} on this computer, {when}. Results open and filter instantly, even offline. Signing out deletes the copy.
    </>
  );
}

/** The local copy and sign out, which deletes it. */
export function ThisComputer() {
  const [signingOut, setSigningOut] = useState(false);

  async function signOut(): Promise<void> {
    setSigningOut(true);
    try {
      await api.signOut();
    } catch (err) {
      toast.error('Couldn’t sign out', { description: err instanceof Error ? err.message : undefined });
      setSigningOut(false);
    }
  }

  return (
    <Setting label="This computer" description={<LocalCopyDescription />}>
      <Button variant="ghost" onClick={() => void signOut()} disabled={signingOut}>
        {signingOut && <Loader2 className="motion-safe:animate-spin" />}
        Sign out
      </Button>
    </Setting>
  );
}
