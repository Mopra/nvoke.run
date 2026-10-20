'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Code on the black screen, with a copy key. `label` names the language or the file. */
export function CodeBlock({ code, label, className }: { code: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard can be blocked. Selecting the text by hand still works.
    }
  }

  return (
    <div className={cn('screen group relative min-w-0 overflow-hidden', className)}>
      <div className="flex h-9 items-center justify-between border-b border-screen-dim/60 pr-1.5 pl-4">
        <span className="cap text-screen-foreground/60">{label ?? ''}</span>
        <button
          type="button"
          onClick={() => void copy()}
          aria-label={copied ? 'Copied' : 'Copy to clipboard'}
          className="cap inline-flex h-6 items-center gap-1.5 rounded-[3px] px-2 text-screen-foreground/55 outline-none transition-colors hover:bg-screen-foreground/10 hover:text-screen-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40"
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="overflow-x-auto px-4 py-4 font-mono text-[13px] leading-relaxed text-screen-foreground">
        <code>{code}</code>
      </pre>
    </div>
  );
}
