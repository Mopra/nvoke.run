import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { MCP_TOOLS } from '@nvoke/shared';
import { afterAll, describe, expect, it } from 'vitest';
import { LocalMcpServer } from './server';
import {
  claudeCodeLine,
  clientLabel,
  cursorJson,
  hasEntry,
  launchSpec,
  listenPath,
  mergeClaudeDesktopConfig,
  pipeArg,
  serverEntry,
} from './setup';

const dir = mkdtempSync(join(tmpdir(), 'nvoke-mcp-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const LAUNCHER = fileURLToPath(new URL('../mcp-launcher.ts', import.meta.url));

describe('setup lines', () => {
  const win = launchSpec({
    execPath: 'C:\\Program Files\\nvoke\\nvoke.exe',
    launcher: 'C:\\Program Files\\nvoke\\resources\\app.asar.unpacked\\out\\main\\mcp-launcher.js',
    pipe: pipeArg('win32', 'C:\\Users\\a\\AppData\\Roaming\\nvoke'),
    appArgs: [],
  });

  it('names a Windows pipe with no backslashes, so any shell keeps it', () => {
    expect(win.args[1]).toMatch(/^nvoke-mcp-[0-9a-f]{12}$/);
    expect(listenPath('win32', win.args[1]!)).toBe(`\\\\.\\pipe\\${win.args[1]}`);
    expect(pipeArg('win32', 'a')).not.toBe(pipeArg('win32', 'b'));
    expect(pipeArg('darwin', '/Users/a/Library/Application Support/nvoke')).toBe('/Users/a/Library/Application Support/nvoke/mcp.sock');
  });

  it('builds the Claude Code line with Node mode switched on', () => {
    expect(claudeCodeLine('win32', win)).toBe(
      `claude mcp add nvoke --scope user -e ELECTRON_RUN_AS_NODE=1 -- "C:\\Program Files\\nvoke\\nvoke.exe" "C:\\Program Files\\nvoke\\resources\\app.asar.unpacked\\out\\main\\mcp-launcher.js" "${win.args[1]}"`,
    );
    const mac = launchSpec({ execPath: "/Apps/it's/nvoke", launcher: '/l.js', pipe: '/s.sock', appArgs: [] });
    expect(claudeCodeLine('darwin', mac)).toBe(`claude mcp add nvoke --scope user -e ELECTRON_RUN_AS_NODE=1 -- '/Apps/it'\\''s/nvoke' '/l.js' '/s.sock'`);
  });

  it('gives Cursor the same entry as Claude Desktop', () => {
    expect(JSON.parse(cursorJson(win))).toEqual({ mcpServers: { nvoke: serverEntry(win) } });
  });

  it('merges into Claude Desktop config and keeps the rest', () => {
    const entry = serverEntry(win);
    const existing = JSON.stringify({ globalShortcut: 'Ctrl+Space', mcpServers: { other: { command: 'x' } } });
    const merged = mergeClaudeDesktopConfig(existing, entry);
    expect(merged.ok && JSON.parse(merged.text)).toEqual({
      globalShortcut: 'Ctrl+Space',
      mcpServers: { other: { command: 'x' }, nvoke: entry },
    });
    expect(merged.ok && merged.changed && !merged.replaced).toBe(true);
    expect(hasEntry(merged.ok ? merged.text : null, entry)).toBe(true);
    expect(hasEntry(null, entry)).toBe(false);

    const fresh = mergeClaudeDesktopConfig(null, entry);
    expect(fresh.ok && JSON.parse(fresh.text)).toEqual({ mcpServers: { nvoke: entry } });

    const old = mergeClaudeDesktopConfig(JSON.stringify({ mcpServers: { nvoke: { command: 'old' } } }), entry);
    expect(old.ok && old.replaced && old.changed).toBe(true);
  });

  it('refuses a config it cannot read rather than overwrite it', () => {
    expect(mergeClaudeDesktopConfig('{ broken', serverEntry(win)).ok).toBe(false);
    expect(mergeClaudeDesktopConfig('[]', serverEntry(win)).ok).toBe(false);
    expect(mergeClaudeDesktopConfig('{"mcpServers": 3}', serverEntry(win)).ok).toBe(false);
  });

  it('names known clients', () => {
    expect(clientLabel('claude-ai')).toBe('Claude Desktop');
    expect(clientLabel('claude-code')).toBe('Claude Code');
    expect(clientLabel('cursor-vscode')).toBe('Cursor');
    expect(clientLabel('zed')).toBe('zed');
  });
});

describe('local MCP server over the launcher', () => {
  async function connectThrough(server: LocalMcpServer) {
    // Off Windows the pipe is a socket file in userData, which always exists in the app.
    const userData = mkdtempSync(join(dir, 'user-'));
    const pipe = pipeArg(process.platform, userData);
    server.listen(listenPath(process.platform, pipe));
    // The launcher, run by plain Node as MCP clients run it in Node mode.
    const transport = new StdioClientTransport({ command: process.execPath, args: [LAUNCHER, pipe], stderr: 'pipe' });
    const client = new Client({ name: 'claude-code', version: '1.0.0' });
    await client.connect(transport);
    return client;
  }

  it('lists the catalog tools and runs them with the session, never a key', async () => {
    const calls: { path: string; init?: RequestInit }[] = [];
    let clients: string[] = [];
    const server = new LocalMcpServer({
      client: {
        api: async (path, init) => {
          calls.push({ path, init });
          return new Response(JSON.stringify({ id: 's1', status: 'queued' }), { status: 201 });
        },
      },
      signedIn: () => true,
      version: '0.0.0',
      onClientsChange: (c) => (clients = c),
    });
    const client = await connectThrough(server);
    try {
      const { tools } = await client.listTools();
      expect(tools.map((t) => t.name).sort()).toEqual(MCP_TOOLS.map((t) => t.name).sort());
      expect(clients).toEqual(['claude-code']);

      const res = await client.callTool({ name: 'start_search', arguments: { kind: 'local', niche: 'dentists', location: 'Aarhus', limit: 5 } });
      expect(res.isError).toBe(false);
      expect(calls[0]!.path).toBe('/v1/searches');
      expect(calls[0]!.init?.method).toBe('POST');
      expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({
        kind: 'local',
        params: { niche: 'dentists', location: 'Aarhus' },
        limit: 5,
      });
    } finally {
      await client.close();
      server.close();
    }
  });

  it('answers with a sign-in hint while signed out', async () => {
    const server = new LocalMcpServer({
      client: { api: async () => new Response('{}') },
      signedIn: () => false,
      version: '0.0.0',
    });
    const client = await connectThrough(server);
    try {
      const res = await client.callTool({ name: 'get_account', arguments: {} });
      expect(res.isError).toBe(true);
      expect(JSON.stringify(res.content)).toContain('sign in');
    } finally {
      await client.close();
      server.close();
    }
  });
});
