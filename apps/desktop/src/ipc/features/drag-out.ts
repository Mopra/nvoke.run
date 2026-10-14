export const DragOutChannel = {
  /** Renderer to main, fire and forget, payload DragCsv. */
  startDragCsv: 'leads:start-drag-csv',
} as const;

export interface DragOutBridge {
  /**
   * Call from a `dragstart` handler after `preventDefault()`. Main writes
   * `csv` to a temp file named `fileName` and starts a native file drag, so
   * the rows drop into Excel, Outlook, a CRM or a folder.
   */
  startDragCsv(fileName: string, csv: string): void;
}
