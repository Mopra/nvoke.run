import { Component, type ReactNode } from 'react';
import { RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Catches a render error anywhere below it and shows a way back instead of
 * an empty window. Data from a newer server is the usual cause, and the
 * updater keeps running in main, so a restart often brings the fix.
 */
export class CrashBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override componentDidCatch(error: Error) {
    console.error(error);
  }

  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="canvas app-drag flex h-screen flex-col items-center justify-center px-6 text-center">
        <h1 className="font-display text-3xl font-semibold">Something broke</h1>
        <p className="mt-3 max-w-sm text-sm text-muted-foreground">
          nvoke hit an error it could not draw past. Reload, and if it keeps happening, update to the latest version.
        </p>
        <p className="mt-4 max-w-md truncate font-mono text-xs text-muted-foreground/70">{this.state.error.message}</p>
        <Button className="mt-8" onClick={() => location.reload()}>
          <RotateCw />
          Reload
        </Button>
      </div>
    );
  }
}
