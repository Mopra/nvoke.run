import { ipcMain } from 'electron';
import { IpcChannel, type DesktopSettings } from '../../ipc/contract';
import type { MainContext } from '../context';

/** `desktop:get-settings`: every feature's settings in one answer. */
export function registerDesktop(ctx: MainContext): void {
  ipcMain.handle(IpcChannel.desktopGetSettings, (): DesktopSettings => ctx.settings());
}
