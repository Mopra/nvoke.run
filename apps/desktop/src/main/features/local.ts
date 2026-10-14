import { join } from 'node:path';
import { app } from 'electron';
import { IpcChannel } from '../../ipc/contract';
import type { MainContext } from '../context';
import { registerLocalIpc } from '../local/ipc';
import { LocalStore } from '../local/store';
import { LeadSync } from '../local/sync';

/** The local copy of the signed-in user's leads in SQLite. It belongs to that account: sign out wipes it. */
export function registerLocalCopy(ctx: MainContext): void {
  const store = new LocalStore(join(app.getPath('userData'), 'leads.sqlite'));
  const sync = new LeadSync({
    client: ctx.session,
    store,
    onChange: (change) => ctx.broadcast(IpcChannel.localChanged, change),
  });
  registerLocalIpc(store, sync);

  ctx.on('auth', (state) => {
    if (state.status === 'signed-in') sync.start();
    else if (state.status === 'signed-out') sync.wipe();
  });
  // No token at launch: whatever an earlier run left behind goes.
  ctx.on('started', (state) => {
    if (state.status === 'signed-in') sync.start();
    else sync.wipe();
  });
  ctx.on('search-deleted', (id) => sync.deleted(id));
}
