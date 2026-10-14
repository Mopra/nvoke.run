import type { MainContext } from '../context';
import { registerMcp as listenForMcp } from '../mcp';

/** Claude Desktop, Claude Code and Cursor reach the signed-in session here. docs/desktop/mcp.md. */
export function registerMcp(ctx: MainContext): void {
  const session = ctx.session;
  const server = listenForMcp({ client: session, signedIn: () => session.getState().status === 'signed-in', listen: !ctx.captureDir });
  ctx.onQuit(() => server.close());
}
