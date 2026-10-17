import type { CaptureStep } from './kit';
import { accountShots } from './shots/account';
import { apiKeysShots } from './shots/api-keys';
import { commandBarShots } from './shots/command-bar';
import { csvDropShots } from './shots/csv-drop';
import { grabShots } from './shots/grab';
import { localCopyShots } from './shots/local-copy';
import { mcpShots } from './shots/mcp';
import { newSearchShots } from './shots/new-search';
import { resultsShots } from './shots/results';
import { searchMoreShots } from './shots/search-more';
import { searchesShots } from './shots/searches';
import { siteProfileShots } from './shots/site-profile';
import { updatesShots } from './shots/updates';

/** Run in this order for each theme. A feature adds its shots in `shots/<feature>.ts` and one line here. */
export const CAPTURE_STEPS: CaptureStep[] = [
  searchesShots,
  commandBarShots,
  siteProfileShots,
  newSearchShots,
  csvDropShots,
  resultsShots,
  localCopyShots,
  accountShots,
  mcpShots,
  apiKeysShots,
  updatesShots,
  grabShots,
  searchMoreShots,
];
