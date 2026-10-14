import { LocalMcp } from '@/components/LocalMcp';

/** The local MCP section with its spacing, or nothing outside the desktop app. */
export function LocalMcpSection() {
  return (
    <div className="mt-16 empty:hidden">
      <LocalMcp />
    </div>
  );
}
