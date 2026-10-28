# Desktop window

The main window is frameless and has no native controls on any platform
(`src/main/window.ts`, `frame: false`, an opaque chassis). The device frame in
`components/AppShell.tsx` is the way around: ports along the top edge are the
navigation, the name plate and the speaker grille sit below them, the black
display strip shows the running search and opens the command bar, and the
power nub at the top right closes the window (`window.nvoke.window.close()`,
nvoke stays in the tray). The top edge is the drag region (`app-drag`;
buttons, links and fields inside opt out automatically), a double click
there maximizes, the edges resize (docs/desktop/look.md). The renderer reads
`window.nvoke.window.getChrome()` and sets `data-platform`, `data-focused`
and `data-fullscreen` on `<html>` (`lib/chrome.ts`); CSS variants `mac:`,
`blurred:` and `fullscreen:` follow them. The appearance setting is sent to
`nativeTheme.themeSource` so the OS side matches. Size, position and theme
are kept in `userData/window-state.json`.

## Tray, login item, quick window

nvoke lives in the tray (menu bar on macOS, `src/main/tray.ts`): closing the
window only hides it, and the app quits from the tray menu or Cmd+Q. Start at
login is a setting on Account (`src/main/login-item.ts`), on after the first
sign-in, and starts hidden. The tray talks to the renderer through
`window.nvoke.desktop.onCommand`. A global shortcut (`src/main/quick-window.ts`,
changeable on Account) opens the quick window, the command bar over any app,
on `#/quick` of the same renderer (docs/desktop/quick-search.md). Its Grab
from screen row covers the display with an overlay (`src/main/screen-grab.ts`,
`#/grab`), reads the dragged box with the OS text engine (`src/main/ocr.ts`,
no bundled OCR) and lists the companies (`src/main/grab-extract.ts` drops
people) for a domains search (docs/desktop/screen-grab.md). Tray icons are
rendered by `pnpm icons` into `apps/desktop/resources` and unpacked from the
asar.

## Updates and MCP

The app updates itself from GitHub Releases (`src/main/updater.ts`,
electron-updater) and shows a What's new card from `apps/desktop/CHANGELOG.md`
on the first start after an update (docs/desktop/updates.md).

nvoke also serves MCP to Claude Desktop, Claude Code and Cursor on the
signed-in session (`src/main/mcp`): a local pipe in main, reached through
`mcp-launcher.js`, which clients run with the app binary and
`ELECTRON_RUN_AS_NODE=1`. Tools come from the catalog through `runMcpTool` in
`packages/shared/src/mcp.ts`, the same runner as the server's `POST /mcp`
(docs/desktop/mcp.md).

## Capture

`pnpm --filter @nvoke/desktop capture` runs the app on demo data with a
throwaway profile, screenshots every screen in light and dark into
`apps/desktop/screenshots/` (gitignored) and quits. `*.window.png` is the
screen cropped to the window, the only capture that shows the window's
edge, so keep the window uncovered while it runs. The script drops
`ELECTRON_RUN_AS_NODE`, which makes electron.exe start as plain Node and exit
when an Electron based tool exported it.
