import { chmodSync, rmSync } from 'node:fs';
import { createServer, type Server, type Socket } from 'node:net';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { MCP_INSTRUCTIONS, MCP_TOOLS, runMcpTool, type McpToolArgs, type McpToolResult } from '@nvoke/shared';
import type { ApiClient } from '../api-bridge';

export interface LocalMcpDeps {
  client: ApiClient;
  signedIn(): boolean;
  version: string;
  /** Called when the set of connected clients changes. */
  onClientsChange?(clients: string[]): void;
}

const SIGNED_OUT =
  'nvoke is signed out on this computer. Ask the user to open nvoke and sign in, then call the tool again.';
const OFFLINE = 'nvoke could not reach its server. Check the connection and try again.';

function errorResult(text: string): McpToolResult {
  return { content: [{ type: 'text', text }], isError: true };
}

/** Runs one tool as the signed-in user, through the session that holds the device token. */
export async function callTool(deps: Pick<LocalMcpDeps, 'client' | 'signedIn'>, name: string, args: McpToolArgs): Promise<McpToolResult> {
  if (!deps.signedIn()) return errorResult(SIGNED_OUT);
  try {
    return await runMcpTool(name, args, async ({ method, url, body }) => {
      const init: RequestInit = { method, headers: { Accept: 'application/json, text/csv' } };
      if (body !== undefined) {
        init.headers = { Accept: 'application/json', 'Content-Type': 'application/json' };
        init.body = JSON.stringify(body);
      }
      const res = await deps.client.api(url, init);
      return { status: res.status, body: await res.text() };
    });
  } catch {
    return errorResult(deps.signedIn() ? OFFLINE : SIGNED_OUT);
  }
}

/**
 * The local MCP server: one MCP session per connection on the pipe, speaking
 * newline delimited JSON like stdio (mcp-launcher relays it). Tools come from
 * MCP_TOOLS and run the same REST routes as `POST /mcp`, with the device
 * token attached here in main.
 */
export class LocalMcpServer {
  private server: Server | null = null;
  private readonly clients = new Map<Socket, string>();

  constructor(private readonly deps: LocalMcpDeps) {}

  listen(path: string): void {
    // A socket file left by a crash blocks listen. The single instance lock
    // means no other nvoke owns it.
    if (process.platform !== 'win32') rmSync(path, { force: true });
    const server = createServer((socket) => void this.accept(socket));
    server.on('error', (err) => console.warn(`[mcp] local server: ${String(err)}`));
    server.listen(path, () => {
      if (process.platform !== 'win32') {
        try {
          chmodSync(path, 0o600);
        } catch {
          // userData is private to the user anyway.
        }
      }
    });
    this.server = server;
  }

  /** Names of the MCP clients connected now, for Account. */
  connectedClients(): string[] {
    return [...new Set(this.clients.values())].filter((name) => name.length > 0);
  }

  close(): void {
    for (const socket of this.clients.keys()) socket.destroy();
    this.server?.close();
    this.server = null;
  }

  private async accept(socket: Socket): Promise<void> {
    socket.on('error', () => undefined);
    this.clients.set(socket, '');
    const mcp = new McpServer({ name: 'nvoke', version: this.deps.version }, { instructions: MCP_INSTRUCTIONS });
    for (const tool of MCP_TOOLS) {
      mcp.registerTool(
        tool.name,
        {
          title: tool.title,
          description: tool.description,
          inputSchema: tool.input,
          annotations: { readOnlyHint: tool.readOnly, destructiveHint: tool.destructive, openWorldHint: false },
        },
        (args: McpToolArgs) => callTool(this.deps, tool.name, args),
      );
    }
    mcp.server.oninitialized = () => {
      this.clients.set(socket, mcp.server.getClientVersion()?.name ?? '');
      this.deps.onClientsChange?.(this.connectedClients());
    };
    socket.once('close', () => {
      this.clients.delete(socket);
      void mcp.close();
      this.deps.onClientsChange?.(this.connectedClients());
    });
    await mcp.connect(new StdioServerTransport(socket, socket));
  }
}
