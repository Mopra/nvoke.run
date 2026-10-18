import { ArrowDownToLine, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { updatesApi, useUpdateState } from '@/lib/updates';

/** A small key among the ports, its LED lit, once an update is ready to install (or, on macOS, to download). Hidden otherwise. */
export function UpdateButton() {
  const state = useUpdateState();
  if (!state?.version || (state.status !== 'ready' && state.status !== 'available')) return null;
  const ready = state.status === 'ready';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="secondary"
          size="sm"
          className="h-7 gap-2 self-start"
          data-update-button
          aria-label={ready ? `Restart to update to ${state.version}` : `Download nvoke ${state.version}`}
          onClick={() => void updatesApi()?.install()}
        >
          <span aria-hidden className="led led-on" />
          {ready ? <RotateCw className="size-3.5" /> : <ArrowDownToLine className="size-3.5" />}
          Update
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {ready ? `Restart to update to ${state.version}` : `Download nvoke ${state.version}`}
      </TooltipContent>
    </Tooltip>
  );
}
