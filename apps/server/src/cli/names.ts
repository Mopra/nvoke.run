/**
 *   pnpm --filter @nvoke/server cli names fix --prod
 *
 * `names fix` lists the company names cut from a page title that
 * companyNameFrom now reads differently ("Website:" on tslmarketing.com
 * becomes "Tslmarketing"), in companies and in campaign leads no step went
 * out to, and the unsent written emails holding the old name. --apply
 * writes them (src/leads/rename-companies.ts). It picks the database like
 * `privacy`.
 */
import { renameCompanies } from '../leads/rename-companies.js';
import { opsDatabase, usage, type Args, type Command } from './shared.js';

/** `cli names fix [--apply]`: recompute company names cut from page titles. */
async function names(args: Args): Promise<void> {
  if (args.positional[1] !== 'fix') usage();
  const apply = args.flags.has('apply');
  const { sql, close } = await opsDatabase(args);
  try {
    const result = await renameCompanies(sql, { apply });
    for (const r of result.renames) console.log(`${r.table}	${r.domain}	${JSON.stringify(r.from)} -> ${JSON.stringify(r.to)}`);
    const companies = result.renames.filter((r) => r.table === 'companies').length;
    console.log(
      `${apply ? 'renamed' : 'would rename'} ${companies} companies, ${result.renames.length - companies} unsent campaign leads; ` +
        `${result.draftsFixed} unsent written emails ${apply ? 'fixed' : 'to fix'}, ${result.draftsEdited} edited by hand left alone`,
    );
    if (!apply) console.log('dry run: add --apply to write');
  } finally {
    await close();
  }
}

export const namesCommand: Command = {
  name: 'names',
  usage: ['  cli names fix [--apply] [--prod]'],
  run: names,
};
