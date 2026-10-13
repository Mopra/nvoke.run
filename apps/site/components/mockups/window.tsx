import type { ReactNode } from 'react';
import { ChevronLeft, Ellipsis, Minus, Plus, Search as SearchIcon, Square, X } from 'lucide-react';
import { Kbd } from '@/components/mockups/primitives';
import { LogoMark } from '@/components/site/logo';
import { cn } from '@/lib/utils';

export type Platform = 'windows' | 'mac';

/** Height of the title strip: 48px on Windows, 52px on macOS, as in the app. */
export const TITLEBAR: Record<Platform, number> = { windows: 48, mac: 52 };

/**
 * The frameless nvoke window: one translucent canvas, the way the app sits on
 * Mica or vibrancy, so whatever is behind the window (the site's aura) tints
 * it. The aura at the top rises when `live` is set, as while a search runs.
 */
export function AppWindow({
  platform,
  live = false,
  overlay,
  children,
  className,
}: {
  platform: Platform;
  live?: boolean;
  /** Drawn over the whole window, such as the command bar and its scrim. */
  overlay?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const radius = platform === 'mac' ? 'rounded-[16px]' : 'rounded-[10px]';
  return (
    <div
      className={cn(
        'relative isolate flex size-full flex-col overflow-hidden bg-background/80 text-foreground shadow-lg backdrop-blur-3xl backdrop-saturate-150',
        radius,
        className,
      )}
    >
      {live && (
        <div className="pointer-events-none absolute -top-[340px] left-1/2 -z-10 h-[520px] w-[900px] -translate-x-1/2">
          <div className="aura absolute inset-0 rounded-full motion-safe:animate-breathe" />
        </div>
      )}
      {children}
      {/* Native controls stay clear of any scrim, as they do in the app. */}
      {overlay}
      {platform === 'mac' ? <TrafficLights /> : <CaptionButtons />}
      {/* A hairline on top of everything, light along the top edge. */}
      <div
        className={cn(
          'pointer-events-none absolute inset-0 border border-foreground/10 shadow-[inset_0_1px_0_var(--highlight)] dark:border-foreground/15',
          radius,
        )}
      />
    </div>
  );
}

function TrafficLights() {
  return (
    <div className="absolute top-[20px] left-[20px] flex gap-2">
      <span className="size-3 rounded-full bg-window-close shadow-[inset_0_0_0_0.5px_var(--shadow-strong)]" />
      <span className="size-3 rounded-full bg-window-minimize shadow-[inset_0_0_0_0.5px_var(--shadow-strong)]" />
      <span className="size-3 rounded-full bg-window-zoom shadow-[inset_0_0_0_0.5px_var(--shadow-strong)]" />
    </div>
  );
}

/** Windows 11 caption buttons: thin glyphs in 46px wide cells, clear over Mica. */
function CaptionButtons() {
  return (
    <div className="absolute top-0 right-0 flex h-[48px] text-foreground/80">
      {[Minus, Square, X].map((Icon, i) => (
        <span key={i} className="flex w-[46px] items-center justify-center">
          <Icon className={cn(i === 1 ? 'size-[11px]' : 'size-[15px]')} strokeWidth={1.2} />
        </span>
      ))}
    </div>
  );
}

/** A round glass button, as in the app's top strip. */
export function GlassIcon({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn('glass flex size-9 items-center justify-center rounded-full text-foreground/85', className)}>
      {children}
    </span>
  );
}

/** The avatar inside its ring: verified emails used this month. */
function AccountRing({ used = 0.8 }: { used?: number }) {
  const r = 17;
  const c = 2 * Math.PI * r;
  return (
    <span className="relative inline-flex size-[38px] items-center justify-center">
      <svg viewBox="0 0 38 38" className="absolute inset-0 -rotate-90">
        <circle cx="19" cy="19" r={r} fill="none" strokeWidth="1.5" className="stroke-foreground/10" />
        <circle
          cx="19"
          cy="19"
          r={r}
          fill="none"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - used)}
          className="stroke-primary"
        />
      </svg>
      <span className="flex size-7 items-center justify-center rounded-full bg-linear-to-b from-foreground/10 to-foreground/20 text-[10.5px] font-semibold text-foreground/80">
        ML
      </span>
    </span>
  );
}

/**
 * The island at the top center. At rest it is the way to search and jump;
 * while a search runs it carries that search's progress.
 */
export function Island({ platform, live }: { platform: Platform; live?: { title: string; emails: number; done: number } }) {
  return (
    <div
      className="absolute inset-x-0 top-0 z-10 flex items-center justify-center"
      style={{ height: TITLEBAR[platform] }}
    >
      <div className="glass flex h-9 items-center gap-2.5 rounded-full pr-2 pl-3.5">
        {live ? (
          <>
            <span className="relative flex size-2">
              <span className="absolute inset-0 rounded-full bg-primary opacity-60 motion-safe:animate-ping" />
              <span className="relative size-2 rounded-full bg-primary" />
            </span>
            <span className="font-medium">{live.title}</span>
            <span className="h-[3px] w-14 overflow-hidden rounded-full bg-foreground/10">
              <span className="block h-full rounded-full bg-primary" style={{ width: `${live.done}%` }} />
            </span>
            <span className="pr-1.5 text-[11.5px] text-muted-foreground tabular-nums">{live.emails} emails</span>
          </>
        ) : (
          <>
            <SearchIcon className="size-[15px] text-muted-foreground" />
            <span className="w-44 text-muted-foreground">Search or jump to</span>
            <Kbd className="bg-transparent">{platform === 'mac' ? '⌘ K' : 'Ctrl K'}</Kbd>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * The top strip of a screen: the mark or a back button on the left, actions,
 * new search and the account on the right, room for the caption buttons.
 */
export function TopBar({
  platform,
  back = false,
  actions,
  newSearch = true,
}: {
  platform: Platform;
  back?: boolean;
  actions?: ReactNode;
  newSearch?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex shrink-0 items-center gap-2',
        platform === 'windows' ? 'pr-[150px] pl-4' : 'pr-4 pl-[84px]',
      )}
      style={{ height: TITLEBAR[platform] }}
    >
      {back ? (
        <GlassIcon>
          <ChevronLeft className="size-[18px] -translate-x-px" />
        </GlassIcon>
      ) : (
        <LogoMark className="size-[22px] shadow-none" />
      )}
      <span className="flex-1" />
      {actions}
      {newSearch && (
        <span className="glass flex h-9 items-center gap-1.5 rounded-full pr-4 pl-3 text-[13px] font-medium text-foreground/85">
          <Plus className="size-[18px] text-primary" strokeWidth={2.25} />
          New search
        </span>
      )}
      <AccountRing />
    </div>
  );
}

export function MoreButton() {
  return (
    <GlassIcon>
      <Ellipsis className="size-4" />
    </GlassIcon>
  );
}
