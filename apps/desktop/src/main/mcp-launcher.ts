/**
 * The stdio side of nvoke's local MCP server. Claude Desktop, Claude Code and
 * Cursor start it as the app binary in Node mode (ELECTRON_RUN_AS_NODE=1):
 *
 *   nvoke mcp-launcher.js <pipe> [app args...]
 *
 * It relays bytes between its stdin and stdout and the running app's local
 * pipe (a named pipe on Windows, a unix socket elsewhere). The MCP server and
 * the device token live in the app's main process; nothing secret passes
 * through here. When the app is not running it starts it hidden in the tray
 * and waits for the pipe. Built as its own entry with Node built-ins only.
 */
import { spawn } from 'node:child_process';
import { connect, type Socket } from 'node:net';

const WAIT_MS = 20_000;
const RETRY_MS = 400;

const [pipeArg, ...appArgs] = process.argv.slice(2);
if (!pipeArg) {
  process.stderr.write('nvoke mcp: missing the pipe argument. Copy the setup line from nvoke, Account.\n');
  process.exit(2);
}
const path = process.platform === 'win32' ? `\\\\.\\pipe\\${pipeArg}` : pipeArg;

function tryConnect(): Promise<Socket | null> {
  return new Promise((resolve) => {
    const socket = connect(path);
    socket.once('connect', () => {
      socket.removeAllListeners('error');
      resolve(socket);
    });
    socket.once('error', () => resolve(null));
  });
}

function startApp(): void {
  const env = { ...process.env };
  delete env['ELECTRON_RUN_AS_NODE'];
  try {
    const child = spawn(process.execPath, [...appArgs, '--hidden'], { detached: true, stdio: 'ignore', env });
    child.unref();
  } catch (err) {
    process.stderr.write(`nvoke mcp: could not start nvoke: ${String(err)}\n`);
  }
}

async function main(): Promise<void> {
  let socket = await tryConnect();
  if (!socket) {
    process.stderr.write('nvoke mcp: nvoke is not running, starting it in the tray\n');
    startApp();
    const deadline = Date.now() + WAIT_MS;
    while (!socket && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, RETRY_MS));
      socket = await tryConnect();
    }
  }
  if (!socket) {
    process.stderr.write('nvoke mcp: could not reach nvoke. Open the nvoke app and try again.\n');
    process.exit(1);
  }
  // stdin was not read until now, so nothing the client sent early is lost.
  process.stdin.pipe(socket);
  socket.pipe(process.stdout);
  socket.on('error', () => process.exit(1));
  socket.on('close', () => process.exit(0));
  process.stdin.on('end', () => socket.end());
}

void main();
