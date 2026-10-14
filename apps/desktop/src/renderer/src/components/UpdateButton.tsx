import { ArrowDownToLine, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { updatesApi, useUpdateState } from '@/lib/updates';

/** A quiet round button in the header once an update is ready to install (or, on macOS, to download). Hidden otherwise. */
export function UpdateButton() {
  const state = useUpdateState();
  if (!state?.version || (state.status !== 'ready' && state.status !== 'available')) return null;
  const ready = state.status === 'ready';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="glass"
          size="icon"
          className="relative"
          data-update-button
          aria-label={ready ? `Restart to update to ${state.version}` : `Download nvoke ${state.version}`}
          onClick={() => void updatesApi()?.install()}
        >
          {ready ? <RotateCw className="size-4" /> : <ArrowDownToLine className="size-4" />}
          <span aria-hidden className="absolute top-1.5 right-1.5 size-2 rounded-full bg-primary ring-2 ring-background" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {ready ? `Restart to update to ${state.version}` : `Download nvoke ${state.version}`}
      </TooltipContent>
    </Tooltip>
  );
}
