import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/cn";

export type OverflowTabItem = {
  value: string;
  label: ReactNode;
};

interface Props {
  items: OverflowTabItem[];
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
}

const OVERFLOW_BUTTON_WIDTH = 32;

export function OverflowTabsList({ items, value, onValueChange, className }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const measureRef = useRef<HTMLDivElement | null>(null);
  const [visibleCount, setVisibleCount] = useState(items.length);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const measure = measureRef.current;
    if (!container || !measure) return;

    const recalc = () => {
      const available = container.clientWidth;
      const children = Array.from(measure.children) as HTMLElement[];
      if (children.length === 0) return;
      const total = children.reduce((sum, c) => sum + c.offsetWidth, 0);
      if (total <= available) {
        setVisibleCount(children.length);
        return;
      }
      const budget = available - OVERFLOW_BUTTON_WIDTH;
      let used = 0;
      let count = 0;
      for (const child of children) {
        const w = child.offsetWidth;
        if (used + w > budget) break;
        used += w;
        count += 1;
      }
      setVisibleCount(count);
    };

    recalc();
    const ro = new ResizeObserver(recalc);
    ro.observe(container);
    ro.observe(measure);
    return () => ro.disconnect();
  }, []);

  const safeCount = Math.min(visibleCount, items.length);
  const visible = items.slice(0, safeCount);
  const overflow = items.slice(safeCount);
  const activeIsOverflowed = overflow.some((t) => t.value === value);

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative flex h-8 shrink-0 items-center border-b border-border bg-muted/20",
        className,
      )}
    >
      <div
        ref={measureRef}
        aria-hidden
        className="pointer-events-none invisible absolute inset-y-0 left-0 flex items-center"
      >
        {items.map((t) => (
          <span
            key={t.value}
            className="inline-flex items-center whitespace-nowrap px-3 py-1 text-sm font-medium"
          >
            {t.label}
          </span>
        ))}
      </div>

      <TabsList className="flex min-w-0 flex-1 justify-start overflow-hidden rounded-none border-0 bg-transparent p-0">
        {visible.map((t) => (
          <TabsTrigger key={t.value} value={t.value}>
            {t.label}
          </TabsTrigger>
        ))}
      </TabsList>

      {overflow.length > 0 && (
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label="More tabs"
              className={cn(
                "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                activeIsOverflowed && "bg-background text-foreground",
              )}
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" sideOffset={4} className="w-40 p-1">
            {overflow.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => onValueChange(t.value)}
                className={cn(
                  "flex w-full items-center rounded px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground",
                  value === t.value && "bg-accent font-medium",
                )}
              >
                {t.label}
              </button>
            ))}
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
