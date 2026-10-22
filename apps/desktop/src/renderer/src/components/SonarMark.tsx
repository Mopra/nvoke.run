import type { ReactNode } from 'react';
import { ICP_NAME } from '@nvoke/shared';
import { ICP_WEIGHT_BADGE, ICP_WEIGHT_TIMES } from '@/lib/format';
import { cn } from '@/lib/utils';

/*
 * Sonar (the `icp` search) is the one black key on the panel: it wears the
 * display strip's material wherever it shows up. Black screen, a lit orange
 * LED, the name in dot matrix and its weight as a "×3" badge. Everything
 * around it stays the grey chassis. docs/desktop/people.md.
 */

/** The black tag: LED, SONAR in dot matrix and, with `weight`, the ×3 badge. For rows and headers. */
export function SonarMark({ weight = false, className }: { weight?: boolean; className?: string }) {
  return (
    <span
      data-sonar
      title={weight ? `${ICP_NAME}: each verified email counts ${ICP_WEIGHT_TIMES}` : ICP_NAME}
      className={cn('screen inline-flex h-[22px] shrink-0 items-center gap-1.5 rounded-[3px] pr-2 pl-1.5 align-middle', className)}
    >
      <span aria-hidden className="led led-on size-[5px]" />
      <span className="lcd pt-px text-[13px] leading-none tracking-[0.1em] uppercase">{ICP_NAME}</span>
      {weight && <SonarWeight className="ml-0.5 text-[13px]" />}
    </span>
  );
}

/** "×3" in dot matrix, the badge Sonar's figures carry. Orange, the one accent on the black. */
export function SonarWeight({ className }: { className?: string }) {
  return (
    <span className={cn('lcd pt-px leading-none text-primary [text-shadow:0_0_8px_var(--glow)]', className)}>
      <span className="sr-only">counts {ICP_WEIGHT_TIMES}</span>
      <span aria-hidden>{ICP_WEIGHT_BADGE}</span>
    </span>
  );
}

/**
 * The black plate at the head of Sonar's form: the LED, SONAR large in dot
 * matrix, what it does in a cap, and the ×3 with what it means.
 */
export function SonarPlate({ note, className }: { note: ReactNode; className?: string }) {
  return (
    <div
      data-sonar-plate
      className={cn('screen relative flex items-center gap-4 overflow-hidden rounded-[6px] px-5 py-3.5', className)}
    >
      <span aria-hidden className="pointer-events-none absolute inset-0 bg-[linear-gradient(100deg,transparent_40%,oklch(1_0_0/0.05)_55%,transparent_70%)]" />
      <span aria-hidden className="led led-on" />
      <span className="lcd text-[28px] leading-none tracking-[0.12em] uppercase">{ICP_NAME}</span>
      <span className="cap hidden min-w-0 truncate text-screen-foreground/50 min-[820px]:inline">{note}</span>
      <span className="ml-auto flex shrink-0 items-baseline gap-2.5">
        <span className="cap text-screen-foreground/50">Per verified email</span>
        <SonarWeight className="text-[24px]" />
      </span>
    </div>
  );
}
