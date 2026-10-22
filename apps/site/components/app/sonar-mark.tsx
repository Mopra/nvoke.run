import { ICP_NAME } from '@nvoke/shared';
import { ICP_WEIGHT_BADGE, ICP_WEIGHT_TIMES } from '@/lib/app/desktop';
import { cn } from '@/lib/utils';

const SIZE = {
  sm: { tag: 'h-5 gap-1.5 px-1.5', name: 'text-[11px]', badge: 'text-[10px]' },
  md: { tag: 'h-6 gap-2 px-2', name: 'text-[13px]', badge: 'text-[11px]' },
  lg: { tag: 'h-9 gap-2.5 px-3', name: 'text-[19px]', badge: 'text-[14px]' },
} as const;

/**
 * Sonar's tag: the one black key on the panel. A piece of the display strip
 * with a lit orange LED, the name in dot matrix and, with `weight`, the "×3"
 * a verified email counts. On a screen already (`onScreen`) it drops the
 * black and keeps a hairline, so it still reads as a tag.
 */
export function SonarMark({
  size = 'md',
  weight = false,
  onScreen = false,
  live = false,
  className,
}: {
  size?: keyof typeof SIZE;
  /** Show the ×3 badge. */
  weight?: boolean;
  /** Set on a display that is black already. */
  onScreen?: boolean;
  /** Blink the LED, while a Sonar search runs. */
  live?: boolean;
  className?: string;
}) {
  const s = SIZE[size];
  return (
    <span
      data-sonar-mark
      title={weight ? `${ICP_NAME}: each verified email counts ${ICP_WEIGHT_TIMES}` : ICP_NAME}
      className={cn(
        'inline-flex shrink-0 items-center rounded-[3px] align-middle whitespace-nowrap',
        onScreen ? 'border border-screen-foreground/20 text-screen-foreground' : 'screen',
        s.tag,
        className,
      )}
    >
      <span aria-hidden className={cn('led led-on', live && 'motion-safe:animate-blink')} />
      <span className={cn('lcd leading-none tracking-[0.08em] uppercase', s.name)}>{ICP_NAME}</span>
      {weight && (
        <span aria-hidden className={cn('lcd leading-none text-primary', s.badge)}>
          {ICP_WEIGHT_BADGE}
        </span>
      )}
      {weight && <span className="sr-only">, each verified email counts {ICP_WEIGHT_TIMES}</span>}
    </span>
  );
}
