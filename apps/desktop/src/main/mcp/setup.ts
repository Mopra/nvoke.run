import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, posix } from 'node:path';

/**
 * Where the local MCP server listens and how an MCP client starts the
 * launcher that reaches it. Pure functions, so the config lines are testable
 * without Electron.
 */

/**
 * The pipe name on Windows (the launcher adds `\\.\pipe\`, so no backslashes
 * reach a shell line), the socket path elsewhere. Derived from userData, so
 * the installed app, a dev build and a capture run never share one.
 */
export function pipeArg(platform: NodeJS.Platform, userData: string): string {
  if (platform === 'win32') return `nvoke-mcp-${createHash('sha256').update(userData).digest('hex').slice(0, 12)}`;
  return posix.join(userData, 'mcp.sock');
}

/** The path `net` listens on for `pipeArg`. Mirrors the launcher. */
export function listenPath(platform: NodeJS.Platform, arg: string): string {
  return platform === 'win32' ? `\\\\.\\pipe\\${arg}` : arg;
}

/**
 * How a client starts the launcher: the app binary in Node mode running
 * `mcp-launcher.js` with the pipe, then the arguments that start the app
 * itself when it is not running (the app path in development).
 */
export interface LaunchSpec {
  command: string;
  args: string[];
  env: Record<string, string>;
}

export function launchSpec(opts: { execPath: string; launcher: string; pipe: string; appArgs: string[] }): LaunchSpec {
  return {
    command: opts.execPath,
    args: [opts.launcher, opts.pipe, ...opts.appArgs],
    env: { ELECTRON_RUN_AS_NODE: '1' },
  };
}

/** Quotes for the user's shell: double quotes on Windows (PowerShell and cmd), single elsewhere. */
function quote(platform: NodeJS.Platform, value: string): string {
  if (platform === 'win32') return `"${value}"`;
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** The `claude mcp add` line for Claude Code, user scope so every project sees it. */
export function claudeCodeLine(platform: NodeJS.Platform, spec: LaunchSpec): string {
  const env = Object.entries(spec.env).map(([k, v]) => `-e ${k}=${v}`);
  return ['claude mcp add nvoke --scope user', ...env, '--', ...[spec.command, ...spec.args].map((v) => quote(platform, v))].join(' ');
}

/** The server entry Claude Desktop and Cursor read under `mcpServers`. */
export function serverEntry(spec: LaunchSpec): { command: string; args: string[]; env: Record<string, string> } {
  return { command: spec.command, args: spec.args, env: spec.env };
}

/** What goes in Cursor's `~/.cursor/mcp.json`. */
export function cursorJson(spec: LaunchSpec): string {
  return JSON.stringify({ mcpServers: { nvoke: serverEntry(spec) } }, null, 2);
}

/**
 * Claude Desktop's config file. On Windows the Store (MSIX) build keeps it
 * in its package folder, so prefer that when it exists.
 */
export function claudeDesktopConfigPath(platform: NodeJS.Platform, env: NodeJS.ProcessEnv = process.env): string {
  const home = homedir();
  if (platform === 'darwin') return join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
  if (platform === 'win32') {
    const local = env['LOCALAPPDATA'] || join(home, 'AppData', 'Local');
    const store = join(local, 'Packages', 'Claude_pzs8sxrjxfjjc', 'LocalCache', 'Roaming', 'Claude');
    if (existsSync(store)) return join(store, 'claude_desktop_config.json');
    return join(env['APPDATA'] || join(home, 'AppData', 'Roaming'), 'Claude', 'claude_desktop_config.json');
  }
  return join(env['XDG_CONFIG_HOME'] || join(home, '.config'), 'Claude', 'claude_desktop_config.json');
}

/** `changed`: the text differs from what is there. `replaced`: an older nvoke entry was there. */
export type MergeResult = { ok: true; text: string; changed: boolean; replaced: boolean } | { ok: false; error: string };

/**
 * Adds or replaces `mcpServers.nvoke` in Claude Desktop's config text and
 * keeps everything else. `null` is a missing file. Refuses a file that is not
 * a JSON object rather than overwrite what the user wrote.
 */
export function mergeClaudeDesktopConfig(existing: string | null, entry: ReturnType<typeof serverEntry>): MergeResult {
  let config: Record<string, unknown> = {};
  if (existing !== null && existing.trim().length > 0) {
    try {
      const parsed: unknown = JSON.parse(existing);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { ok: false, error: 'Claude Desktop’s config is not a JSON object.' };
      config = parsed as Record<string, unknown>;
    } catch {
      return { ok: false, error: 'Claude Desktop’s config is not valid JSON. Fix it in Claude Desktop, then try again.' };
    }
  }
  const servers = config['mcpServers'];
  if (servers !== undefined && (!servers || typeof servers !== 'object' || Array.isArray(servers))) {
    return { ok: false, error: 'Claude Desktop’s config has an mcpServers value that is not an object.' };
  }
  const current = (servers as Record<string, unknown> | undefined)?.['nvoke'];
  const changed = existing === null || JSON.stringify(current) !== JSON.stringify(entry);
  const next = { ...config, mcpServers: { ...(servers as Record<string, unknown> | undefined), nvoke: entry } };
  return { ok: true, text: `${JSON.stringify(next, null, 2)}\n`, changed, replaced: current !== undefined };
}

/** True when the config text already holds exactly this entry. */
export function hasEntry(existing: string | null, entry: ReturnType<typeof serverEntry>): boolean {
  const merged = mergeClaudeDesktopConfig(existing, entry);
  return merged.ok && !merged.changed;
}

/** A readable name for the `clientInfo.name` an MCP client sends at initialize. */
export function clientLabel(name: string): string {
  const n = name.toLowerCase();
  if (n === 'claude-ai' || n.includes('claude desktop')) return 'Claude Desktop';
  if (n.startsWith('claude-code') || n === 'claude code') return 'Claude Code';
  if (n.startsWith('cursor')) return 'Cursor';
  return name;
}
