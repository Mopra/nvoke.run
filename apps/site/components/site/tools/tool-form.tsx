'use client';

import { useId, type FormEvent, type ReactNode } from 'react';
import { LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * The one-field form every tool uses: a large monospace pill and the primary
 * button beside it (under it on phones), then a hint or an error.
 */
export function ToolForm({
  label,
  placeholder,
  type,
  value,
  onChange,
  onSubmit,
  busy,
  submitLabel,
  busyLabel,
  hint,
  error,
  children,
}: {
  label: string;
  placeholder: string;
  type: 'email' | 'domain';
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  busy: boolean;
  submitLabel: string;
  busyLabel: string;
  hint?: ReactNode;
  error?: string | null;
  /** Under the hint, like the Turnstile widget. */
  children?: ReactNode;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!busy) onSubmit();
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <label htmlFor={`${id}-input`} className="sr-only">
        {label}
      </label>
      <div className="glass-strong flex flex-col gap-2 rounded-[28px] p-2 transition-shadow has-[input:focus-visible]:ring-[3px] has-[input:focus-visible]:ring-ring/25 sm:flex-row sm:items-center sm:rounded-full">
        <input
          id={`${id}-input`}
          name={type}
          type={type === 'email' ? 'email' : 'text'}
          inputMode={type === 'email' ? 'email' : 'url'}
          autoComplete={type === 'email' ? 'email' : 'off'}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-describedby={[hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined}
          aria-invalid={error ? true : undefined}
          className="h-14 min-w-0 flex-1 rounded-full bg-transparent px-5 font-mono text-base outline-none placeholder:text-muted-foreground/60 sm:text-[17px]"
        />
        <Button type="submit" size="xl" disabled={busy} aria-busy={busy} className="w-full sm:w-auto">
          {busy ? <LoaderCircle className="size-4 motion-safe:animate-spin" aria-hidden="true" /> : null}
          {busy ? busyLabel : submitLabel}
        </Button>
      </div>
      {error ? (
        <p id={errorId} role="alert" className="px-5 text-center text-sm text-pretty text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="px-5 text-center text-sm text-pretty text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {children}
    </form>
  );
}

/** The card a result sits in. */
export function ResultCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn('glass-strong flex flex-col gap-7 rounded-[28px] p-6 sm:p-9', className)}
    >
      {children}
    </div>
  );
}
