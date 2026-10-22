/**
 * The desktop renderer's pure helpers, shared with the web app so both say
 * and show the same things: labels, search titles, number and time formats,
 * countries and the export notice. Only renderer modules that never touch
 * `window.nvoke` and import nothing through the `@/` alias belong here (see
 * "Web app" in CLAUDE.md). Next compiles them from source like @nvoke/shared.
 */
export {
  FEED_SOURCE_LABEL,
  ICP_WEIGHT_BADGE,
  ICP_WEIGHT_NOTE,
  ICP_WEIGHT_TIMES,
  KIND_LABEL,
  STATUS_LABEL,
  VERIFICATION_HINT,
  VERIFICATION_LABEL,
  WINDOW_DAYS,
  WINDOW_LABEL,
  capitalize,
  csvFileName,
  duration,
  errorMessage,
  formatNumber,
  isActive,
  listTitle,
  nextRunLabel,
  percent,
  periodLabel,
  relativeTime,
  resetDate,
  runsAdded,
  runTitle,
  searchSubtitle,
  searchRuns,
  searchTitle,
  sourcesLabel,
  type LaunchWindow,
  type SearchRun,
} from '../../../desktop/src/renderer/src/lib/format';
export { countries, countryName, matchCountries, type Country } from '../../../desktop/src/renderer/src/lib/countries';
export { dismissExportNotice, shouldShowExportNotice } from '../../../desktop/src/renderer/src/lib/export-notice';
export {
  emailsLeft,
  inboxChecking,
  inboxCost,
  INBOX_FOLLOW_MS,
  inboxPollMs,
  SHARED_INBOXES,
} from '../../../desktop/src/renderer/src/lib/people';
