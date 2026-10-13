/**
 * Finder style row selection: a click selects one row, Cmd/Ctrl click
 * toggles a row, Shift click selects the range from the anchor (the last row
 * clicked without Shift) and Cmd/Ctrl Shift click adds that range.
 */

export interface Selection {
  ids: ReadonlySet<string>;
  anchor: string | null;
}

export const EMPTY_SELECTION: Selection = { ids: new Set(), anchor: null };

export function clickSelect(
  current: Selection,
  order: readonly string[],
  id: string,
  { toggle = false, range = false }: { toggle?: boolean; range?: boolean } = {},
): Selection {
  if (range) {
    const from = current.anchor === null ? -1 : order.indexOf(current.anchor);
    const to = order.indexOf(id);
    if (from === -1 || to === -1) return { ids: new Set([id]), anchor: id };
    const span = order.slice(Math.min(from, to), Math.max(from, to) + 1);
    const ids = new Set(toggle ? current.ids : []);
    for (const x of span) ids.add(x);
    return { ids, anchor: current.anchor };
  }
  if (toggle) {
    const ids = new Set(current.ids);
    if (ids.has(id)) ids.delete(id);
    else ids.add(id);
    return { ids, anchor: id };
  }
  return { ids: new Set([id]), anchor: id };
}

/** The selected items, in list order. */
export function pickSelected<T extends { id: string }>(items: readonly T[], selection: Selection): T[] {
  return items.filter((item) => selection.ids.has(item.id));
}
