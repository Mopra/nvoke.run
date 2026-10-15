/**
 * The desktop renderer's pure helpers, shared with the web app so both say
 * and show the same things: labels, search titles, number and time formats,
 * countries and the export notice. Only renderer modules that never touch
 * `window.nvoke` and import nothing through the `@/` alias belong here (see
 * "Web app" in CLAUDE.md). Next compiles them from source like @nvoke/shared.
 */
export {
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
  percent,
  periodLabel,
  relativeTime,
  resetDate,
  searchSubtitle,
  searchTitle,
  type LaunchWindow,
} from '../../../desktop/src/renderer/src/lib/format';
export { countries, countryName, matchCountries, type Country } from '../../../desktop/src/renderer/src/lib/countries';
export { dismissExportNotice, shouldShowExportNotice } from '../../../desktop/src/renderer/src/lib/export-notice';
