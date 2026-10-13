import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Download links for the desktop installers. Read at build time, so the
// download page stays static.
//
// DOWNLOAD_BASE_URL points at the folder that holds the release files, for
// example https://github.com/OWNER/nvoke/releases/download/v0.1.0 once the
// repository is public. When it is unset the page shows "Coming soon".
// DOWNLOAD_VERSION overrides the version in the file names. It defaults to
// the version in apps/desktop/package.json.
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

export function getDownloads(): Downloads {
  const base = process.env['DOWNLOAD_BASE_URL']?.replace(/\/+$/, '') || null;
  const version = desktopVersion();
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
          'The installer is not code signed yet. If Windows SmartScreen stops it, click "More info", then "Run anyway".',
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
          'The app is not notarized yet. The first time, right click nvoke in Applications, choose Open and confirm.',
      },
      {
        os: 'linux',
        name: 'Linux',
        requirement: 'x86_64, with FUSE for AppImage',
        files: [file('AppImage', `nvoke-${version}-linux-x86_64.AppImage`)],
        firstRun: 'Make the file executable with chmod +x, then run it.',
      },
    ],
  };
}
