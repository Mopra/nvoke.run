import type { ReactNode } from 'react';
import { Minus, Plus, Rows3, Search as SearchIcon, Square, X } from 'lucide-react';
import { SEARCHES } from '@/components/mockups/data';
import { Kbd, StatusDot } from '@/components/mockups/primitives';
import { LogoMark } from '@/components/site/logo';
import { cn } from '@/lib/utils';

export type Platform = 'windows' | 'mac';

/** Height of the title strip: 48px on Windows, 52px on macOS, as in the app. */
export const TITLEBAR: Record<Platform, number> = { windows: 48, mac: 52 };

/**
 * The frameless nvoke window. The page area is opaque; the sidebar is a
 * translucent source list over the window material, so whatever sits behind
 * the window (the site's glow) tints it, the way Mica and vibrancy do.
 */
export function AppWindow({
  platform,
  sidebar,
  overlay,
  children,
  className,
}: {
  platform: Platform;
  sidebar?: ReactNode;
  /** Drawn over the whole window, such as a dialog and its scrim. */
  overlay?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'relative flex size-full overflow-hidden text-foreground shadow-lg',
        platform === 'mac' ? 'rounded-[12px]' : 'rounded-[9px]',
        className,
      )}
    >
      {sidebar}
      <div className="relative flex min-w-0 flex-1 flex-col bg-background">{children}</div>
      {/* Native controls stay clear of any scrim, as they do in the app. */}
      {overlay}
      {platform === 'mac' ? <TrafficLights /> : <CaptionButtons />}
      {/* A hairline on top of everything, light along the top edge. */}
      <div
        className={cn(
          'pointer-events-none absolute inset-0 border border-foreground/10 shadow-[inset_0_1px_0_var(--highlight)] dark:border-foreground/15',
          platform === 'mac' ? 'rounded-[12px]' : 'rounded-[9px]',
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

/** Windows 11 caption buttons: thin glyphs in 46px wide cells. */
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

const item = 'flex h-7 items-center gap-2.5 rounded-[7px] px-2 text-[13px]';
const idle = 'text-sidebar-foreground/80';
const active = 'bg-sidebar-accent font-medium text-sidebar-accent-foreground';

/** The app's sidebar: logo, search, navigation, recent searches, usage and account. */
export function Sidebar({
  platform,
  current,
}: {
  platform: Platform;
  /** Which row is selected: the searches list, the new search form, or a recent search by index. */
  current: 'searches' | 'new' | number;
}) {
  return (
    <aside className="flex w-[236px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar-material px-2.5 pb-2.5 text-sidebar-foreground backdrop-blur-2xl backdrop-saturate-150">
      <div
        className={cn('flex shrink-0 items-center gap-2 px-2', platform === 'mac' && 'pl-[78px]')}
        style={{ height: TITLEBAR[platform] }}
      >
        <LogoMark className="size-[18px] shadow-none" />
        <span className="text-[15px] font-semibold tracking-[-0.02em]">nvoke</span>
      </div>
      <div className="mb-3 flex h-7 shrink-0 items-center gap-2 rounded-[8px] bg-sidebar-accent/70 px-2 text-sidebar-foreground/50">
        <SearchIcon className="size-3.5" />
        <span className="flex-1">Search</span>
        <Kbd className="bg-transparent text-sidebar-foreground/40">{platform === 'mac' ? '⌘ K' : 'Ctrl K'}</Kbd>
      </div>
      <div className="flex flex-col gap-px">
        <div className={cn(item, current === 'searches' ? active : idle)}>
          <Rows3
            className={cn('size-4', current === 'searches' ? 'text-sidebar-primary' : 'text-sidebar-foreground/55')}
          />
          <span className="flex-1">Searches</span>
          <span className="text-[11.5px] text-sidebar-foreground/50 tabular-nums">1</span>
        </div>
        <div className={cn(item, current === 'new' ? active : idle)}>
          <Plus className={cn('size-4', current === 'new' ? 'text-sidebar-primary' : 'text-sidebar-foreground/55')} />
          New search
        </div>
      </div>
      <div className="mt-5 px-2 pb-1 text-[11.5px] font-semibold text-sidebar-foreground/45">Recent</div>
      <div className="flex flex-col gap-px">
        {SEARCHES.map((s, i) => (
          <div key={s.title} className={cn(item, current === i ? active : idle)}>
            <span className="flex w-4 justify-center">
              <StatusDot status={s.status} />
            </span>
            <span className="truncate">{s.title}</span>
          </div>
        ))}
      </div>
      <div className="mt-auto flex flex-col gap-2.5 pt-3">
        <div className="flex flex-col gap-1.5 px-2">
          <div className="flex items-baseline justify-between text-[11.5px]">
            <span className="text-sidebar-foreground/55">Emails this month</span>
            <span className="text-sidebar-foreground/75 tabular-nums">1,596 of 2,000</span>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-sidebar-foreground/10">
            <div className="h-full w-[80%] rounded-full bg-sidebar-foreground/45" />
          </div>
        </div>
        <div className="flex h-11 items-center gap-2.5 px-1.5">
          <span className="flex size-7 items-center justify-center rounded-full bg-linear-to-b from-foreground/10 to-foreground/20 text-[10.5px] font-semibold text-foreground/80">
            ML
          </span>
          <span className="leading-tight">
            <span className="block font-medium">Mette Lindqvist</span>
            <span className="block text-[11.5px] text-sidebar-foreground/55">Pro plan</span>
          </span>
        </div>
      </div>
    </aside>
  );
}

/** The toolbar row at the top of a screen, with room for the caption buttons. */
export function Toolbar({
  platform,
  children,
  className,
}: {
  platform: Platform;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn('flex shrink-0 items-center gap-2 pl-5', platform === 'windows' ? 'pr-[150px]' : 'pr-5', className)}
      style={{ height: TITLEBAR[platform] }}
    >
      {children}
    </div>
  );
}
