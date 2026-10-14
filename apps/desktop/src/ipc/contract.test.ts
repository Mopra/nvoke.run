import { describe, expect, it } from 'vitest';
import { ApiChannel } from './features/api';
import { AppChannel } from './features/app';
import { AuthChannel } from './features/auth';
import { CsvDropChannel } from './features/csv-drop';
import { DesktopChannel } from './features/desktop';
import { DragOutChannel } from './features/drag-out';
import { GrabChannel } from './features/grab';
import { InboxChannel } from './features/inbox';
import { LocalChannel } from './features/local';
import { LocalCrawlChannel } from './features/local-crawl';
import { McpChannel } from './features/mcp';
import { NotificationsChannel } from './features/notifications';
import { QuickChannel } from './features/quick';
import { TrayChannel } from './features/tray';
import { WindowChannel } from './features/window';
import { IpcChannel } from './contract';

const features = [
  ApiChannel,
  AppChannel,
  AuthChannel,
  CsvDropChannel,
  DesktopChannel,
  DragOutChannel,
  GrabChannel,
  InboxChannel,
  LocalChannel,
  LocalCrawlChannel,
  McpChannel,
  NotificationsChannel,
  QuickChannel,
  TrayChannel,
  WindowChannel,
];

describe('IpcChannel', () => {
  it('keeps every feature channel: no key is shadowed by another feature', () => {
    const keys = features.flatMap((f) => Object.keys(f));
    expect(Object.keys(IpcChannel)).toHaveLength(keys.length);
  });

  it('never gives two channels the same name', () => {
    const names = Object.values(IpcChannel);
    expect(new Set(names).size).toBe(names.length);
  });
});
