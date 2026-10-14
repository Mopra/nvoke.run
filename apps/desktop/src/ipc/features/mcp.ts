/** The local MCP server Claude Desktop, Claude Code and Cursor reach through the app's sign-in. */
export const McpChannel = {
  mcpGetSetup: 'mcp:get-setup',
  mcpAddToClaudeDesktop: 'mcp:add-to-claude-desktop',
  /** Main to renderer push, payload string[]: the MCP clients connected now. */
  mcpClientsChanged: 'mcp:clients-changed',
} as const;

/**
 * How Claude Desktop, Claude Code and Cursor reach nvoke's local MCP server.
 * They start the app binary in Node mode on a small launcher that relays
 * stdio to a pipe in main, so they use this app's sign-in and no API key.
 */
export interface McpSetup {
  /** The `claude mcp add` line for Claude Code. */
  claudeCode: string;
  /** The JSON for Cursor's `~/.cursor/mcp.json`. */
  cursor: string;
  claudeDesktop: {
    configPath: string;
    /** Claude Desktop's config folder exists. */
    installed: boolean;
    /** The config already holds this exact nvoke entry. */
    added: boolean;
  };
  /** MCP clients connected now, by readable name. */
  clients: string[];
}

export type ClaudeDesktopResult =
  /** Written: `added` the first time, `updated` when an older entry was replaced. */
  | { status: 'added' | 'updated' | 'unchanged' | 'canceled' | 'not-installed' }
  | { status: 'error'; error: string };

export interface McpApi {
  getSetup(): Promise<McpSetup>;
  /** Asks for confirmation in a native dialog, then writes nvoke into claude_desktop_config.json. */
  addToClaudeDesktop(): Promise<ClaudeDesktopResult>;
  /** Subscribes to connected client changes. Returns an unsubscribe function. */
  onClientsChange(listener: (clients: string[]) => void): () => void;
}

export interface McpBridge {
  mcp: McpApi;
}
