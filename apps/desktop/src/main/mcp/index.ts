import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { IpcChannel, type ClaudeDesktopResult, type McpSetup } from '../../ipc/contract';
import type { ApiClient } from '../api-bridge';
import { LocalMcpServer } from './server';
import {
  claudeCodeLine,
  claudeDesktopConfigPath,
  clientLabel,
  cursorJson,
  hasEntry,
  launchSpec,
  listenPath,
  mergeClaudeDesktopConfig,
  pipeArg,
  serverEntry,
  type LaunchSpec,
} from './setup';

/**
 * The launcher sits next to the main bundle. Packaged, it is unpacked from
 * the asar (see asarUnpack in electron-builder.yml), so Node mode can run it.
 */
function launcherPath(): string {
  return join(__dirname, 'mcp-launcher.js').replace(/app\.asar([\\/])/, 'app.asar.unpacked$1');
}

function spec(): LaunchSpec {
  return launchSpec({
    execPath: process.execPath,
    launcher: launcherPath(),
    pipe: pipeArg(process.platform, app.getPath('userData')),
    // In development the binary is the bare electron.exe, which needs the app folder.
    appArgs: app.isPackaged ? [] : [app.getAppPath()],
  });
}

function readText(path: string): string | null {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

/** Starts the pipe server (unless `listen` is false) and registers the mcp:* channels. */
export function registerMcp(opts: { client: ApiClient; signedIn(): boolean; listen: boolean }): LocalMcpServer {
  const labels = (names: string[]) => [...new Set(names.map(clientLabel))];
  const server = new LocalMcpServer({
    client: opts.client,
    signedIn: opts.signedIn,
    version: app.getVersion(),
    onClientsChange: (clients) => {
      for (const win of BrowserWindow.getAllWindows()) win.webContents.send(IpcChannel.mcpClientsChanged, labels(clients));
    },
  });
  if (opts.listen) server.listen(listenPath(process.platform, pipeArg(process.platform, app.getPath('userData'))));

  ipcMain.handle(IpcChannel.mcpGetSetup, (): McpSetup => {
    const s = spec();
    const configPath = claudeDesktopConfigPath(process.platform);
    return {
      claudeCode: claudeCodeLine(process.platform, s),
      cursor: cursorJson(s),
      claudeDesktop: {
        configPath,
        installed: existsSync(dirname(configPath)),
        added: hasEntry(readText(configPath), serverEntry(s)),
      },
      clients: labels(server.connectedClients()),
    };
  });

  ipcMain.handle(IpcChannel.mcpAddToClaudeDesktop, async (event): Promise<ClaudeDesktopResult> => {
    const configPath = claudeDesktopConfigPath(process.platform);
    if (!existsSync(dirname(configPath))) return { status: 'not-installed' };
    const existing = readText(configPath);
    const merged = mergeClaudeDesktopConfig(existing, serverEntry(spec()));
    if (!merged.ok) return { status: 'error', error: merged.error };
    if (!merged.changed) return { status: 'unchanged' };

    const options = {
      type: 'question' as const,
      buttons: ['Add nvoke', 'Cancel'],
      defaultId: 0,
      cancelId: 1,
      message: 'Add nvoke to Claude Desktop?',
      detail: `This adds an “nvoke” server to ${configPath}. Nothing else in the file changes. Quit and reopen Claude Desktop to load it.`,
    };
    const win = BrowserWindow.fromWebContents(event.sender);
    const { response } = win ? await dialog.showMessageBox(win, options) : await dialog.showMessageBox(options);
    if (response !== 0) return { status: 'canceled' };

    try {
      mkdirSync(dirname(configPath), { recursive: true });
      // Write beside it and rename, so Claude Desktop never reads half a file.
      const tmp = `${configPath}.nvoke-tmp`;
      writeFileSync(tmp, merged.text, 'utf8');
      renameSync(tmp, configPath);
    } catch (err) {
      return { status: 'error', error: err instanceof Error ? err.message : 'Couldn’t write the file.' };
    }
    return { status: merged.replaced ? 'updated' : 'added' };
  });

  return server;
}
