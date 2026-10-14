import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { describeUpdate, updatesApi, useUpdateState } from '@/lib/updates';
import { Setting } from './Setting';

/** The running version and its update. Only in the desktop app. */
export function Updates() {
  const state = useUpdateState();
  if (!state) return null;
  const api = updatesApi();
  const busy = state.status === 'checking' || state.status === 'downloading';

  return (
    <Setting label="Updates" description={describeUpdate(state)}>
      {state.status === 'ready' ? (
        <Button onClick={() => void api?.install()}>Restart</Button>
      ) : state.status === 'available' ? (
        <Button onClick={() => void api?.install()}>Download</Button>
      ) : (
        <Button variant="ghost" disabled={busy || state.status === 'unsupported'} onClick={() => void api?.check()}>
          {busy && <Loader2 className="motion-safe:animate-spin" />}
          Check now
        </Button>
      )}
    </Setting>
  );
}
