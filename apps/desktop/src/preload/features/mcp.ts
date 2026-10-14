import { ipcRenderer } from 'electron';
import { IpcChannel, type ClaudeDesktopResult, type McpBridge, type McpSetup } from '../../ipc/contract';
import { listen } from '../listen';

export const mcpBridge: McpBridge = {
  mcp: {
    getSetup: () => ipcRenderer.invoke(IpcChannel.mcpGetSetup) as Promise<McpSetup>,
    addToClaudeDesktop: () => ipcRenderer.invoke(IpcChannel.mcpAddToClaudeDesktop) as Promise<ClaudeDesktopResult>,
    onClientsChange: (listener) => listen(IpcChannel.mcpClientsChanged, listener),
  },
};
