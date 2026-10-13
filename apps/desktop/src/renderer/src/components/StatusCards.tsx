import { useEffect, useState } from 'react';
import type { HealthResponse } from '@nvoke/shared';
import type { AppInfo } from '../../../ipc/contract';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

type ServerState = { kind: 'loading' } | { kind: 'ok'; health: HealthResponse } | { kind: 'error'; message: string };

export function StatusCards() {
  const [server, setServer] = useState<ServerState>({ kind: 'loading' });
  const [app, setApp] = useState<AppInfo | null>(null);

  useEffect(() => {
    window.nvoke
      .getHealth()
      .then((health) => setServer({ kind: 'ok', health }))
      .catch((err: unknown) => setServer({ kind: 'error', message: err instanceof Error ? err.message : String(err) }));
    window.nvoke
      .getAppInfo()
      .then(setApp)
      .catch(() => setApp(null));
  }, []);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Server</CardTitle>
          <CardDescription>{app?.apiUrl ?? 'Unknown'}</CardDescription>
        </CardHeader>
        <CardContent className="text-sm">
          {server.kind === 'loading' && <span className="text-muted-foreground">Checking...</span>}
          {server.kind === 'ok' && (
            <div className="flex items-center gap-2">
              <Badge variant="secondary">online</Badge>
              <span className="text-muted-foreground">v{server.health.version}</span>
            </div>
          )}
          {server.kind === 'error' && (
            <div className="flex items-center gap-2">
              <Badge variant="destructive">offline</Badge>
              <span className="text-muted-foreground">{server.message}</span>
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>App</CardTitle>
          <CardDescription>From the preload bridge</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {app ? `${app.name} ${app.version}, ${app.platform} ${app.arch}, Electron ${app.electron}` : 'Unavailable'}
        </CardContent>
      </Card>
    </div>
  );
}
