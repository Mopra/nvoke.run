#!/usr/bin/env node
// Cuts a desktop release: `pnpm release 0.2.0`.
//
// 1. Checks apps/desktop/CHANGELOG.md has a `## 0.2.0` section. The app shows
//    it after the update and the workflow uses it as the GitHub release notes.
// 2. Sets "version" in apps/desktop/package.json.
// 3. Commits those two files (and nothing else), tags v0.2.0 and pushes both.
//    The tag starts .github/workflows/release.yml, which builds every
//    platform and publishes the release that installed apps update from.
//
// `--notes 0.2.0` prints the section instead, for the workflow.
// `--dry-run` checks and prints what it would do.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { changelogSection, compareVersions, isVersion } from '../apps/desktop/src/main/changelog.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const desktop = join(root, 'apps', 'desktop');
const pkgFile = join(desktop, 'package.json');
const changelogFile = join(desktop, 'CHANGELOG.md');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const notesOnly = args.includes('--notes');
const version = args.find((a) => !a.startsWith('--'))?.replace(/^v/, '');

function fail(message) {
  console.error(`release: ${message}`);
  process.exit(1);
}

function git(...gitArgs) {
  return execFileSync('git', gitArgs, { cwd: root, encoding: 'utf8' }).trim();
}

if (!isVersion(version)) fail('give a version like 0.2.0');

const notes = changelogSection(readFileSync(changelogFile, 'utf8'), version);
if (!notes) fail(`apps/desktop/CHANGELOG.md has no "## ${version}" section with notes`);
if (notesOnly) {
  process.stdout.write(`${notes}\n`);
  process.exit(0);
}

const pkgRaw = readFileSync(pkgFile, 'utf8');
const pkg = JSON.parse(pkgRaw);
const tag = `v${version}`;

if (git('branch', '--show-current') !== 'main') fail('release from main');
if (git('tag', '--list', tag)) fail(`tag ${tag} exists already`);
if (compareVersions(version, pkg.version) < 0) fail(`${version} is older than the current ${pkg.version}`);

console.log(`Releasing nvoke ${version} (was ${pkg.version})\n\n${notes}\n`);
if (dryRun) process.exit(0);

if (pkg.version !== version) {
  writeFileSync(pkgFile, pkgRaw.replace(/"version":\s*"[^"]+"/, `"version": "${version}"`));
}
git('add', '--', 'apps/desktop/package.json', 'apps/desktop/CHANGELOG.md');
// Nothing staged means both files already say this version, for example a retried release.
if (git('diff', '--cached', '--name-only', '--', 'apps/desktop/package.json', 'apps/desktop/CHANGELOG.md')) git('commit', '-m', `Release ${tag}`, '--', 'apps/desktop/package.json', 'apps/desktop/CHANGELOG.md');
git('tag', '-a', tag, '-m', `nvoke ${version}`);
git('push', 'origin', 'HEAD');
git('push', 'origin', tag);
console.log(`Pushed ${tag}. Follow the build: gh run watch, or the Actions tab.`);
