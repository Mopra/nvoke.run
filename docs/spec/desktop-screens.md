# Desktop screens

Each desktop feature has its own page in `docs/desktop/`. A new feature adds its page there and one line here.

- **Searches** (home): list with status, counters and progress. A "New search" button.
- **Start from your website**: [docs/desktop/site-profile.md](../desktop/site-profile.md). New search opens on it; the tabs below are "Set up a search by hand".
- **New search**: four tabs (Local businesses, Web search, New launches, Paste a list) with the fields above and a limit. Paste a list has a large monospace field, one item per line, and reads it back as it is typed: how many domains and how many names to look up, and the first few items. A country line appears once the list holds a name. There is no limit field: the list is the limit. Searches of a list are titled by their first items ("linear.app, Pleo and 5 more"). The command bar has "Paste a list of companies". Clipboard lookup, screen OCR, CSV drop (below) and the inbox folder build on this kind.
- **Search results**: table of companies with their emails and verification badges. Filter by verification and email kind, text search, copy email, open website, export CSV (saved via a native save dialog).
  - **Selection.** Click selects a row, Cmd/Ctrl click toggles one, Shift click selects the range from the last plain click, Cmd/Ctrl Shift click adds that range. Cmd/Ctrl+A selects every loaded row; Escape, a click on empty canvas or the bar's close button clears. Changing a filter clears it. A glass bar above the dock counts the selection.
  - **Drag out.** Dragging a selected row drags the whole selection; dragging any other row drags that row alone. The renderer builds the CSV (export columns, one row per email, a company without emails gets one row with blank email fields, UTF-8 BOM, formulas defused like the server export) and sends it on `leads:start-drag-csv`. Main checks it (a string, at most 16 MB, the name cleaned like the export's), writes it to `<temp>/nvoke-drag/<uuid>/<name>.csv` and calls `webContents.startDrag` with the OS icon for .csv files. It drops into Excel, Outlook, a CRM in the browser or a folder. Drag folders older than a day are removed at launch and on each drag. The file is named `<domain>.csv` for one company, `nvoke-<search>-<n>.csv` for several.
  - **Copy.** Cmd/Ctrl+C copies the selection as tab separated text with a header row, same columns and rows as the drag, so a paste into a spreadsheet keeps the columns. Tabs and line breaks inside a value become spaces. Selected text and focused fields keep the normal copy.
- **Search more**: [docs/desktop/search-more.md](../desktop/search-more.md). An ended search takes another run with new params into the same list.
- **Openers per company**: [docs/desktop/openers.md](../desktop/openers.md).
- **CSV drop**: [docs/desktop/csv-drop.md](../desktop/csv-drop.md).
- **Inbox folder**: [docs/desktop/inbox.md](../desktop/inbox.md).
- **Drops**: the user's drops with what each delivered and when it runs next, and the feed's last week per source. Each drop has Edit, Check now, Pause or Resume and Delete. The editor is a sentence like New search: "Watch [keyword] from [sources] up to [N] a day called [name]". The searches a drop makes appear in Searches with the drop's name; their menu has Open drop instead of Run again.
- **Account**: user, plan, verified email meter, appearance, Open at login, Quick search shortcut, Inbox folder, Drop notifications, Read blocked sites from this computer (on by default, see [Local render crawl](local-render-crawl.md)), Updates (version, Check now, Restart or Download), sign out (with what the local copy holds and when it last synced), Use nvoke in Claude and Cursor (below), Upgrade or Manage billing (opens `/desktop/billing` on the site), and API keys (create, shown once, revoke) with the MCP setup line.
- **Tray and start at login**: [docs/desktop/tray.md](../desktop/tray.md).
- **Quick search**: [docs/desktop/quick-search.md](../desktop/quick-search.md).
- **Local copy**: [docs/desktop/local-copy.md](../desktop/local-copy.md).
- **Local MCP**: [docs/desktop/mcp.md](../desktop/mcp.md).
- **Drop notifications**: [docs/desktop/notifications.md](../desktop/notifications.md).
- **Grab from screen**: [docs/desktop/screen-grab.md](../desktop/screen-grab.md).
- **Updates, What's new and releases**: [docs/desktop/updates.md](../desktop/updates.md).
