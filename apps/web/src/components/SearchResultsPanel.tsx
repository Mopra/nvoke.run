import type { RecentItem } from "../lib/useRecentSearches";

export interface ResultItem {
  id: string;
  label: string;
  hint?: string;
  path: string;
}

export interface ResultSection {
  id: string;
  title: string;
  items: ResultItem[];
}

interface Props {
  query: string;
  sections: ResultSection[];
  recents: RecentItem[];
  suggested: RecentItem[];
  selectedIndex: number;
  onSelect: (item: ResultItem) => void;
  onHoverIndex: (index: number) => void;
}

function flatten(sections: ResultSection[]): ResultItem[] {
  return sections.flatMap((s) => s.items);
}

export function SearchResultsPanel({
  query,
  sections,
  recents,
  suggested,
  selectedIndex,
  onSelect,
  onHoverIndex,
}: Props) {
  const isEmptyState = query.trim() === "";

  const visible: ResultSection[] = isEmptyState
    ? [
        ...(recents.length > 0
          ? [{ id: "recent", title: "Recent", items: recents }]
          : []),
        { id: "suggested", title: "Suggested", items: suggested },
      ]
    : sections;

  const flat = flatten(visible);

  if (!isEmptyState && flat.length === 0) {
    return (
      <div className="p-4 text-center text-sm text-muted-foreground">
        No results
      </div>
    );
  }

  let runningIndex = -1;

  return (
    <div className="max-h-[min(480px,70vh)] overflow-auto p-1">
      {visible.map((section) => (
        <div key={section.id} className="py-1">
          <div className="px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {section.title}
          </div>
          {section.items.map((item) => {
            runningIndex += 1;
            const index = runningIndex;
            const isSelected = index === selectedIndex;
            return (
              <button
                key={`${section.id}-${item.id}`}
                type="button"
                onMouseDown={(e) => {
                  // prevent blur-before-click swallowing the select
                  e.preventDefault();
                }}
                onClick={() => onSelect(item)}
                onMouseEnter={() => onHoverIndex(index)}
                className={
                  "flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm " +
                  (isSelected
                    ? "bg-accent text-accent-foreground"
                    : "text-foreground hover:bg-accent hover:text-accent-foreground")
                }
              >
                <span>{item.label}</span>
                {item.hint && (
                  <span className="text-xs text-muted-foreground">{item.hint}</span>
                )}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
