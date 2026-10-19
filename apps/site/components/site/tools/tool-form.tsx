'use client';

import { useId, type FormEvent, type ReactNode } from 'react';
import { LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** A big mono field on a hairline, no box: the tools and the opt-out form share it. */
export const fieldClass =
  'h-14 w-full min-w-0 rounded-none bg-transparent px-0.5 font-mono text-[18px] shadow-[inset_0_-1px_0_var(--border)] outline-none transition-shadow duration-150 placeholder:text-muted-foreground/70 focus-visible:shadow-[inset_0_-2px_0_var(--foreground)] aria-invalid:shadow-[inset_0_-2px_0_var(--destructive)] sm:text-[22px]';

/**
 * The one-field form every tool uses: the field on a hairline and the dark
 * key beside it (under it on phones), then a hint or an error.
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
      <label htmlFor={`${id}-input`} className="cap text-muted-foreground">
        {label}
      </label>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-5">
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
          className={`${fieldClass} flex-1`}
        />
        <Button type="submit" size="xl" variant="dark" disabled={busy} aria-busy={busy} className="w-full sm:w-auto">
          {busy ? <LoaderCircle className="size-4 motion-safe:animate-spin" aria-hidden="true" /> : null}
          {busy ? busyLabel : submitLabel}
        </Button>
      </div>
      {error ? (
        <p id={errorId} role="alert" className="flex items-center gap-2 text-sm text-pretty text-foreground">
          <span aria-hidden="true" className="led bg-destructive" />
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-sm text-pretty text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {children}
    </form>
  );
}

/** What a result says, for screen readers: the screen itself is drawn for the eye. */
export function Announce({ children }: { children: ReactNode }) {
  return (
    <p role="status" aria-live="polite" className="sr-only">
      {children}
    </p>
  );
}
