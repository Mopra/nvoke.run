import type { CSSProperties } from "react";
import { Check } from "lucide-react";
import { LogoMark } from "@/components/Logo";
import { progressCaption } from "@/components/SearchProgress";
import { cn } from "@/lib/utils";
import type { Search } from "@/lib/types";

/** Where the leads come from on the sonar: angle in degrees, distance as a share of the radius, start delay. */
const BLIPS = [
  { angle: -38, distance: 0.92, delay: 0.4 },
  { angle: 152, distance: 0.78, delay: 1.5 },
  { angle: 64, distance: 0.96, delay: 2.6 },
  { angle: -128, distance: 0.84, delay: 3.4 },
  { angle: 18, distance: 0.7, delay: 4.5 },
  { angle: 206, distance: 0.9, delay: 5.3 },
];

/** The steps a search walks through before its first leads, worded per kind. */
function steps(search: Search): string[] {
  const first = {
    icp: "Planning where your customers are",
    domains: "Reading your list",
    local: "Searching the map",
    web: "Searching the web",
    launches: "Reading new launches",
    drop: "Reading new launches",
  }[search.kind];
  return [
    first,
    "Finding companies",
    "Reading their websites",
    "Finding people and checking emails",
  ];
}

/** The step the search is on, from what it reports and what it has found. */
function currentStep(search: Search): number {
  if (search.emailsFound > 0 || search.companiesCrawled > 0) return 3;
  if (search.companiesFound > 0) return 2;
  if (search.status === "queued" || search.stage === "plan") return 0;
  // A plain words search plans first; once it reads lists and maps it is finding.
  if (search.kind === "icp" && !search.stage) return 0;
  return 1;
}

/**
 * The wait between starting a search and its first leads. A sonar pulses out
 * from the mark and pulls leads in, the line under it says what the pipeline
 * is doing right now, and the steps show how far along it is. It replaces the
 * empty list while a search runs, so the screen never looks idle.
 */
export function SearchWorking({ search }: { search: Search }) {
  const at = currentStep(search);
  const caption = progressCaption(search);
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center justify-center gap-14 px-6 pt-6 pb-28 motion-safe:animate-rise"
    >
      <div className="relative size-44 shrink-0">
        {/* The aura behind the mark breathes while it works. */}
        <div className="absolute inset-4 rounded-full bg-radial from-primary/20 to-transparent to-70% motion-safe:animate-breathe" />
        {[0, 1, 2].map((ring) => (
          <span
            key={ring}
            className="absolute inset-0 rounded-full border border-primary/40 opacity-0 motion-safe:animate-sonar"
            style={{ animationDelay: `${ring * 1.1}s` }}
          />
        ))}
        <span className="absolute inset-[22%] rounded-full border border-foreground/[0.06]" />
        <span className="absolute inset-0 rounded-full border border-foreground/[0.04]" />
        {BLIPS.map((blip, i) => (
          <span
            key={i}
            className="absolute top-1/2 left-1/2 -mt-[3px] -ml-[3px] size-1.5 rounded-full bg-primary opacity-0 shadow-glow motion-safe:animate-pull-in"
            style={
              {
                "--blip-x": `${Math.cos((blip.angle * Math.PI) / 180) * blip.distance * 88}px`,
                "--blip-y": `${Math.sin((blip.angle * Math.PI) / 180) * blip.distance * 88}px`,
                animationDelay: `${blip.delay}s`,
              } as CSSProperties
            }
          />
        ))}
        <div className="absolute inset-0 flex items-center justify-center">
          <LogoMark motion="loading" className="size-12" />
        </div>
      </div>

      <div className="min-w-0 max-w-md">
        <h2 className="font-display text-2xl font-semibold">
          {search.kind === "icp"
            ? "Looking for your customers"
            : "Looking for companies"}
        </h2>
        {/* Keyed on the text, so each new step fades in. */}
        <p
          key={caption}
          className="mt-1.5 truncate text-sm text-muted-foreground motion-safe:animate-fade-in"
        >
          {caption}
        </p>

        <ol className="mt-6 flex flex-col gap-2.5 text-sm">
          {steps(search).map((label, i) => (
            <li
              key={label}
              className={cn(
                "flex items-center gap-3 transition-colors duration-500",
                i < at && "text-muted-foreground",
                i === at && "font-medium text-foreground",
                i > at && "text-muted-foreground/50",
              )}
            >
              <span className="relative flex size-5 shrink-0 items-center justify-center">
                {i < at ? (
                  <Check
                    className="size-4 text-primary motion-safe:animate-pop-in"
                    strokeWidth={2.25}
                  />
                ) : i === at ? (
                  <>
                    <span className="absolute inset-0 rounded-full bg-primary/25 motion-safe:animate-ping-soft" />
                    <span className="size-2 rounded-full bg-primary shadow-glow" />
                  </>
                ) : (
                  <span className="size-1.5 rounded-full bg-foreground/20" />
                )}
              </span>
              {label}
            </li>
          ))}
        </ol>

        <p className="mt-6 text-xs text-muted-foreground">
          First leads usually land within a minute or two. Feel free to close
          the window: nvoke keeps going and tells you when it is done.
        </p>
      </div>
    </div>
  );
}
