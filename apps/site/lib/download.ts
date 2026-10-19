import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Download links for the desktop installers. Read at build time, so the
// download page stays static.
//
// The files come from the GitHub Release of the same version as
// apps/desktop/package.json (`pnpm release` publishes it), so a link never
// names a file that release does not hold. DOWNLOAD_BASE_URL overrides the
// folder; set it to an empty string to show "Coming soon" instead.
// DOWNLOAD_VERSION overrides the version in the file names.
//
// File names follow the artifactName in apps/desktop/electron-builder.yml:
// ${productName}-${version}-${os}-${arch}.${ext}. AppImage writes x64 as x86_64.

export type OsId = 'windows' | 'mac' | 'linux';

export type DownloadFile = { label: string; fileName: string; url: string | null };

export type DownloadTarget = {
  os: OsId;
  name: string;
  requirement: string;
  files: DownloadFile[];
  firstRun: string;
};

export type Downloads = { version: string; available: boolean; targets: DownloadTarget[] };

function desktopVersion(): string {
  const override = process.env['DOWNLOAD_VERSION'];
  if (override) return override.replace(/^v/, '');
  try {
    const raw = readFileSync(join(process.cwd(), '..', 'desktop', 'package.json'), 'utf8');
    const pkg = JSON.parse(raw) as { version?: string };
    if (pkg.version) return pkg.version;
  } catch {
    // apps/desktop is not part of this build. Use the fallback below.
  }
  return '0.1.0';
}

const RELEASES = 'https://github.com/Mopra/nvoke.run/releases/download';

export function getDownloads(): Downloads {
  const version = desktopVersion();
  const configured = process.env['DOWNLOAD_BASE_URL'];
  const base = configured === undefined ? `${RELEASES}/v${version}` : configured.replace(/\/+$/, '') || null;
  const file = (label: string, fileName: string): DownloadFile => ({
    label,
    fileName,
    url: base ? `${base}/${fileName}` : null,
  });

  return {
    version,
    available: base !== null,
    targets: [
      {
        os: 'windows',
        name: 'Windows',
        requirement: 'Windows 10 or 11, 64-bit',
        files: [file('Installer (.exe)', `nvoke-${version}-win-x64.exe`)],
        firstRun:
          'Not code signed yet. If SmartScreen blocks it, click "More info", then "Run anyway".',
      },
      {
        os: 'mac',
        name: 'macOS',
        requirement: 'macOS 12 or later',
        files: [
          file('Apple silicon (.dmg)', `nvoke-${version}-mac-arm64.dmg`),
          file('Intel (.dmg)', `nvoke-${version}-mac-x64.dmg`),
        ],
        firstRun:
          'Not notarized yet. First launch: right click nvoke in Applications, choose Open, confirm.',
      },
      {
        os: 'linux',
        name: 'Linux',
        requirement: 'x86_64, with FUSE for AppImage',
        files: [file('AppImage', `nvoke-${version}-linux-x86_64.AppImage`)],
        firstRun: 'chmod +x it, then run it. You know the drill.',
      },
    ],
  };
}
