/** A CSV dropped on the window and the enriched copy written next to it. */
export const CsvDropChannel = {
  /** Renderer to main, payload SaveEnriched, answers SaveEnrichedResult. */
  saveEnriched: 'files:save-enriched',
  /** Renderer to main, payload a path written by saveEnriched. */
  revealFile: 'files:reveal',
} as const;

export type SaveEnrichedResult =
  /** Written to `filePath`, next to the original. */
  | { saved: true; filePath: string }
  | { saved: false; error: string };

/** Files dropped on the window and the enriched copy written next to them. */
export interface FilesApi {
  /**
   * The path of a file from a drop event, or '' when it has none. Runs in the
   * preload (`webUtils.getPathForFile`); the renderer reads the file's text itself.
   */
  pathFor(file: File): string;
  /**
   * Writes `csv` as `<name>.nvoke.csv` in the folder of `sourcePath`, a CSV,
   * TSV or TXT file that must exist. Main works out the name, never the
   * renderer, and replaces an earlier enriched copy.
   */
  saveEnriched(sourcePath: string, csv: string): Promise<SaveEnrichedResult>;
  /** Shows a file written by `saveEnriched` in the file manager. Refuses any other file. */
  reveal(filePath: string): Promise<void>;
}

export interface CsvDropBridge {
  files: FilesApi;
}
