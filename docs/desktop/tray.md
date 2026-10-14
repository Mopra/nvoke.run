# Tray and start at login

**Tray** (menu bar on macOS): nvoke lives there while it runs. The menu has Open nvoke, New search, today's drop line ("Today’s drops: 12 leads", the verified emails from drop searches made since local midnight, read from `GET /v1/searches`; it opens that search, or Searches when there are several) and Quit nvoke. On Windows and Linux a click on the icon opens the window. Closing the window hides it and keeps nvoke running; the first close says so once in a notification. Quit from the tray (or Cmd+Q) ends it.

**Open at login**: a switch on Account, on by default once the user first signs in. The app then starts hidden in the tray with no window (`--hidden` on Windows and Linux, `wasOpenedAtLogin` on macOS). Windows and macOS use the OS login item, Linux an XDG autostart entry. Development builds save the setting but never register. Kept in `userData/desktop-settings.json`.
