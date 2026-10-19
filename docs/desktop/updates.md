# Updates and releases

## In the app

nvoke updates itself from GitHub Releases on `Mopra/nvoke.run` through
`electron-updater` (`apps/desktop/src/main/updater.ts`). It checks 30 seconds
after launch and every 4 hours after that. Nothing runs in development or
capture runs (`unsupported`).

- **Windows (NSIS) and Linux (AppImage)**: a new version downloads in the
  background, using the blockmap so only the changed blocks come down. Once
  it is ready:
  - the header shows **Restart to update**, the tray menu gets **Restart to
    update to x.y.z**, and Account says so under **Updates**;
  - quitting nvoke installs it;
  - if the window stays hidden in the tray for 10 minutes, nvoke installs it
    silently and comes back hidden (a marker in
    `userData/update-relaunch.json`, read once at the next start, keeps the
    window closed). Nothing on screen moves.
- **macOS**: builds are not signed yet, and Squirrel.Mac refuses unsigned
  updates. The app only checks: when a version is out it shows **Update** in
  the header, a tray item and the Account row, which open the dmg for this
  Mac (`nvoke-x.y.z-mac-arm64.dmg` or `-x64`). The zip and `latest-mac.yml`
  are published anyway, so signing later is the only change needed.
- A failed check (offline, GitHub down) shows on Account and retries on the
  next round. **Check now** on Account checks at once.

## What's new

On the first start after an update the window shows a card that drops from
the island: "What's new in x.y.z" with the bullets from
`apps/desktop/CHANGELOG.md` for every version newer than the one the user
last saw (several, when they skipped some). Closing it in any way stores the
running version as `lastSeenVersion` in `userData/desktop-settings.json`, so
it shows once. Until then it stays pending: an update that installed while
the window was hidden shows the card when the user first opens the window. A
fresh install stores its version straight away and shows nothing. The notes
are bundled into the app (`CHANGELOG.md?raw`), so the card works offline.

IPC: `src/ipc/features/updates.ts`, main wiring in
`src/main/features/updates.ts`, UI in `components/WhatsNew.tsx`,
`components/UpdateButton.tsx` and `screens/account/Updates.tsx`. Capture
shots `20-whats-new` and `20b-update-ready`.

## Cutting a release

1. Add a `## x.y.z` section to `apps/desktop/CHANGELOG.md`, newest first. One
   short bullet per change, written for the user, since they read it in the
   app.
2. `pnpm release x.y.z` on `main` (`scripts/release.mjs`). It checks the
   section exists, sets `version` in `apps/desktop/package.json`, commits
   those two files only, tags `vx.y.z` and pushes. `--dry-run` checks
   without changing anything.
3. The tag runs `.github/workflows/release.yml`: it checks the tag matches the
   app version, builds Windows, macOS and Linux, and only when all three pass
   publishes one GitHub Release with the installers, zips, blockmaps and
   `latest.yml`, `latest-mac.yml`, `latest-linux.yml`, using the changelog
   section as its notes. A version with a suffix (`0.3.0-beta.1`) is published
   as a prerelease, which only prerelease builds pick up.

The installed apps see it within 4 hours. The site's download page links to
the release of the version in `apps/desktop/package.json`
(`apps/site/lib/download.ts`), so its links work once the release workflow
has published; no Vercel setting is needed.

Requirements: the repository must be public (installed apps read the release
without a token), and the workflow needs nothing beyond the default
`GITHUB_TOKEN`. To keep the code private instead, publish to a separate public
repository: change `publish` in `electron-builder.yml`, `RELEASES` in
`updater.ts`, and give the release job a token for that repository.
