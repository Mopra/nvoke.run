// Fails if any source, doc or config file contains an em dash or en dash.
// House rule: rewrite the sentence instead (comma, colon, full stop, "to").
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'out', 'release', 'coverage', '.next']);
const EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.mjs', '.cjs', '.json', '.md', '.css', '.html', '.yml', '.yaml', '.sql', '.example',
]);
const SKIP_FILES = new Set(['pnpm-lock.yaml']);
const BANNED = [
  { char: String.fromCharCode(0x2014), name: 'em dash' },
  { char: String.fromCharCode(0x2013), name: 'en dash' },
];

const problems = [];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry) || SKIP_FILES.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full);
      continue;
    }
    if (!EXTENSIONS.has(extname(entry))) continue;
    const lines = readFileSync(full, 'utf8').split('\n');
    lines.forEach((line, i) => {
      for (const { char, name } of BANNED) {
        if (line.includes(char)) problems.push(`${relative(ROOT, full)}:${i + 1}: ${name}`);
      }
    });
  }
}

walk(ROOT);

if (problems.length > 0) {
  console.error('Banned punctuation found. Rewrite these sentences:');
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log('punctuation check passed');
