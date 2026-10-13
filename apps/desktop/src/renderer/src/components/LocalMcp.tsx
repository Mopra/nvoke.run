import { useEffect, useState } from 'react';
import { ArrowUpRight, Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { McpSetup } from '../../../ipc/contract';
import { CopyField, DocsLink, SectionHeading } from '@/components/ApiKeys';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { mcpApi, trayPlace } from '@/lib/desktop';
import { MCP_DOCS_URL } from '@/lib/env';

const CLAUDE_DOWNLOAD_URL = 'https://claude.ai/download';

/** Who is connected now, as one quiet line with a live dot. */
function Connected({ clients }: { clients: string[] }) {
  if (clients.length === 0) return null;
  return (
    <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
      <span className="relative flex size-2">
        <span className="absolute inline-flex size-full rounded-full bg-primary opacity-60 motion-safe:animate-ping" />
        <span className="relative inline-flex size-2 rounded-full bg-primary" />
      </span>
      In use by {clients.join(', ')}
    </p>
  );
}

/**
 * Claude Desktop, Claude Code and Cursor through this app's sign-in. They
 * start a launcher that talks to the main process, so no API key leaves it.
 * Only in the desktop app.
 */
export function LocalMcp() {
  const [mcp] = useState(mcpApi);
  const [setup, setSetup] = useState<McpSetup | null>(null);
  const [clients, setClients] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!mcp) return;
    mcp
      .getSetup()
      .then((s) => {
        setSetup(s);
        setClients(s.clients);
      })
      .catch(() => undefined);
    return mcp.onClientsChange(setClients);
  }, [mcp]);

  if (!mcp || !setup) return null;

  async function addToClaude(): Promise<void> {
    if (!mcp) return;
    setAdding(true);
    try {
      const result = await mcp.addToClaudeDesktop();
      if (result.status === 'added' || result.status === 'updated' || result.status === 'unchanged') {
        toast.success(result.status === 'unchanged' ? 'Already in Claude Desktop' : 'Added to Claude Desktop', {
          description: 'Quit and reopen Claude Desktop to load nvoke.',
        });
        setSetup(await mcp.getSetup());
      } else if (result.status === 'not-installed') {
        toast.error('Claude Desktop isn’t installed', { description: 'Install it, open it once, then try again.' });
      } else if (result.status === 'error') {
        toast.error('Couldn’t add nvoke to Claude Desktop', { description: result.error });
      }
    } catch (err) {
      toast.error('Couldn’t add nvoke to Claude Desktop', { description: err instanceof Error ? err.message : undefined });
    } finally {
      setAdding(false);
    }
  }

  const { claudeDesktop } = setup;
  return (
    <section data-local-mcp>
      <SectionHeading
        title="Use nvoke in Claude and Cursor"
        description={`They search and read leads as you, through this app. No API key. If nvoke is closed, they start it in the ${trayPlace()}.`}
        action={<DocsLink href={MCP_DOCS_URL}>Tools</DocsLink>}
      />
      <Connected clients={clients} />
      <div className="mt-6 flex flex-col gap-6">
        <div className="flex items-center gap-8">
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-medium">Claude Desktop</div>
            <div className="mt-1 text-sm text-muted-foreground">
              {!claudeDesktop.installed
                ? 'Not installed on this computer.'
                : claudeDesktop.added
                  ? 'Added. Quit and reopen Claude Desktop if it doesn’t show nvoke yet.'
                  : 'Adds nvoke to its config after you confirm.'}
            </div>
          </div>
          <div className="shrink-0">
            {!claudeDesktop.installed ? (
              <Button variant="outline" onClick={() => void api.openExternal(CLAUDE_DOWNLOAD_URL)}>
                Get Claude Desktop
                <ArrowUpRight className="size-3.5 opacity-60" />
              </Button>
            ) : claudeDesktop.added ? (
              <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Check className="size-4" />
                Added
              </span>
            ) : (
              <Button onClick={() => void addToClaude()} disabled={adding}>
                {adding && <Loader2 className="motion-safe:animate-spin" />}
                Add to Claude Desktop
              </Button>
            )}
          </div>
        </div>
        <div>
          <div className="mb-2 text-sm font-medium">Claude Code</div>
          <CopyField value={setup.claudeCode} what="command" />
        </div>
        <div>
          <div className="mb-2 flex items-baseline justify-between gap-4">
            <span className="text-sm font-medium">Cursor</span>
            <span className="font-mono text-xs text-muted-foreground">~/.cursor/mcp.json</span>
          </div>
          <CopyField value={setup.cursor} what="Cursor config" className="whitespace-pre-wrap" />
        </div>
      </div>
    </section>
  );
}
