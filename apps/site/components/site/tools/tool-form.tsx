'use client';

import { useId, type FormEvent, type ReactNode } from 'react';
import { LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * The one-field form every tool uses: a recessed field on a plate and the
 * orange key beside it (under it on phones), then a hint or an error.
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
      <div className="plate flex flex-col gap-2 rounded-[6px] p-2 sm:flex-row sm:items-center">
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
          className="h-12 min-w-0 flex-1 rounded-[4px] bg-background/60 px-4 font-mono text-base shadow-[inset_0_1px_2px_var(--shadow-strong)] outline-none transition-shadow placeholder:text-muted-foreground/90 focus-visible:ring-[3px] focus-visible:ring-ring/25 aria-invalid:ring-[3px] aria-invalid:ring-destructive/25 sm:text-[16px]"
        />
        <Button type="submit" size="lg" disabled={busy} aria-busy={busy} className="h-12 w-full sm:w-auto">
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

/** The plate a result sits on. */
export function ResultCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div role="status" aria-live="polite" className={cn('plate flex flex-col gap-6 rounded-[6px] p-5 sm:p-8', className)}>
      {children}
    </div>
  );
}

/**
 * The subject of a result on the black screen: what was checked on the left,
 * the figure that matters lit in the dot matrix on the right.
 */
export function ResultScreen({ subject, figure, unit }: { subject: string; figure?: string; unit?: string }) {
  return (
    <div className="screen flex items-center justify-between gap-4 px-4 py-3">
      <span className="min-w-0 font-mono text-[14px] break-all text-screen-foreground/70">{subject}</span>
      {figure ? (
        <span className="flex shrink-0 items-baseline gap-2">
          <span className="lcd text-[34px] leading-none">{figure}</span>
          {unit ? <span className="cap text-screen-foreground/50">{unit}</span> : null}
        </span>
      ) : null}
    </div>
  );
}

/** A 16 segment meter, lit orange from the left: the running state. */
export function LedMeter({ value }: { value: number }) {
  const lit = Math.round(Math.max(0, Math.min(1, value)) * 16);
  return (
    <div className="flex gap-0.5" aria-hidden="true">
      {Array.from({ length: 16 }, (_, i) => (
        <span
          key={i}
          className={cn(
            'h-2.5 flex-1 rounded-[1px] transition-colors duration-300',
            i < lit ? 'bg-primary' : 'bg-foreground/[0.12]',
          )}
        />
      ))}
    </div>
  );
}
