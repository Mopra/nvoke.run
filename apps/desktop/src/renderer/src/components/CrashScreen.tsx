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
    // A plate on the chassis: a fault lamp, a light title and the message in mono.
    return (
      <div className="canvas app-drag flex h-screen items-center justify-center px-6">
        <div className="glass-strong flex w-full max-w-[420px] flex-col items-start gap-4 rounded-[8px] p-6">
          <span className="cap flex items-center gap-2 text-muted-foreground">
            <span className="led bg-destructive shadow-[0_0_6px_var(--destructive)]" />
            Fault
          </span>
          <h1 className="font-display text-2xl font-light">Something broke</h1>
          <p className="font-mono text-xs text-muted-foreground">
            nvoke hit an error it could not draw past. Reload, and if it keeps happening, update to the latest version.
          </p>
          <p className="w-full truncate font-mono text-xs text-muted-foreground/70">{this.state.error.message}</p>
          <Button className="mt-2" onClick={() => location.reload()}>
            <RotateCw />
            Reload
          </Button>
        </div>
      </div>
    );
  }
}
