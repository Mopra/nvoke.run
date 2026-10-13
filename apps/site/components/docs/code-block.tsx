'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Monospace block with a copy button. `label` names the language or the file. */
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
    <div className={cn('group relative min-w-0 overflow-hidden rounded-2xl bg-foreground/[0.045] dark:bg-foreground/[0.06]', className)}>
      <div className="flex h-10 items-center justify-between pr-1.5 pl-5">
        <span className="font-mono text-[11px] tracking-wide text-muted-foreground uppercase">{label ?? ''}</span>
        <button
          type="button"
          onClick={() => void copy()}
          aria-label={copied ? 'Copied' : 'Copy to clipboard'}
          className="inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs text-muted-foreground outline-none transition-colors hover:bg-foreground/[0.07] hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40"
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="overflow-x-auto px-5 pb-5 font-mono text-[13px] leading-relaxed text-foreground">
        <code>{code}</code>
      </pre>
    </div>
  );
}
