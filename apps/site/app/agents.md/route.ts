import { agentsMarkdown } from '@/lib/agent-docs';

export const dynamic = 'force-static';

export function GET() {
  return new Response(agentsMarkdown(), { headers: { 'content-type': 'text/markdown; charset=utf-8' } });
}
