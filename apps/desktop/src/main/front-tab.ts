import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { itemDomain } from '@nvoke/shared';
import type { FrontTab } from '../ipc/contract';

/**
 * Reads the address of the browser tab in front, so the quick window can offer
 * "Who runs this site". Called only when the user presses the shortcut, never
 * in the background.
 *
 * - Windows: a short PowerShell script walks the top level windows through UI
 *   Automation in z-order, skips nvoke's own and topmost ones, and reads the
 *   address bar of Chrome, Edge, Firefox or Brave when one of them is in front.
 *   UI Automation ships with Windows, so there is nothing to install.
 * - macOS: the window list (no permission needed) names the app in front, then
 *   AppleScript asks Safari, Chrome or Arc for the URL. That needs the user's
 *   Automation permission, so the first read per browser waits for the user to
 *   choose the row, which explains why macOS is about to ask.
 * - Linux and anything else: nothing.
 */

/** Windows process names of the browsers we read, and how the row names them. */
const WINDOWS_BROWSERS: Record<string, string> = {
  chrome: 'Chrome',
  msedge: 'Edge',
  firefox: 'Firefox',
  brave: 'Brave',
};

/** macOS app names (window owners) of the browsers we read, and the AppleScript that returns the URL. */
const MAC_BROWSERS: Record<string, { label: string; script: string }> = {
  Safari: { label: 'Safari', script: 'tell application "Safari" to get URL of front document' },
  'Google Chrome': { label: 'Chrome', script: 'tell application "Google Chrome" to get URL of active tab of front window' },
  Arc: { label: 'Arc', script: 'tell application "Arc" to get URL of active tab of front window' },
};

/** The browser label a Windows process name stands for, or null when it is not one we read. */
export function windowsBrowser(processName: string): string | null {
  return WINDOWS_BROWSERS[processName.toLowerCase()] ?? null;
}

/** The browser label a macOS app name stands for, or null when it is not one we read. */
export function macBrowser(appName: string): string | null {
  return MAC_BROWSERS[appName]?.label ?? null;
}

/**
 * The domain behind what an address bar shows. Browsers often drop the scheme
 * (`acme.com/about`), so that is accepted; any scheme other than http(s), such
 * as `chrome://` or `file://`, is not a site.
 */
export function tabDomain(address: string): string | null {
  const raw = address.trim();
  if (raw.length === 0 || raw.length > 2048) return null;
  // A colon before a digit is a port (`acme.com:8080`), not a scheme.
  const scheme = /^([a-z][a-z0-9+.-]*):(?!\d)/i.exec(raw)?.[1]?.toLowerCase();
  if (scheme && scheme !== 'http' && scheme !== 'https') return null;
  if (raw.includes('@') && !raw.includes('/')) return null;
  return itemDomain(raw);
}

/** Parses the Windows helper's one line of JSON: `{"process":"chrome","url":"..."}`. */
export function parseWindowsHelper(stdout: string): FrontTab | null {
  let data: unknown;
  try {
    data = JSON.parse(stdout.trim());
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object') return null;
  const { process: name, url } = data as Record<string, unknown>;
  if (typeof name !== 'string' || typeof url !== 'string') return null;
  const browser = windowsBrowser(name);
  const domain = tabDomain(url);
  return browser && domain ? { status: 'read', browser, domain } : null;
}

/** True when AppleScript failed because the user has not allowed nvoke to control the browser (error -1743). */
export function isAutomationDenied(stderr: string): boolean {
  return /-1743|not authori[sz]ed to send apple events/i.test(stderr);
}

// The script below walks the desktop's children, which UI Automation lists
// front to back. The first window that is not nvoke's, not topmost (the
// taskbar, overlays) and has a window pattern is the app the user was in.
const WINDOWS_SCRIPT = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$A = [System.Windows.Automation.AutomationElement]
$T = [System.Windows.Automation.TreeScope]
$own = __PID__
$browsers = @('chrome', 'msedge', 'firefox', 'brave')
$front = $null
foreach ($w in $A::RootElement.FindAll($T::Children, [System.Windows.Automation.Condition]::TrueCondition)) {
  if ($w.Current.ProcessId -eq $own) { continue }
  $p = $null
  if (-not $w.TryGetCurrentPattern([System.Windows.Automation.WindowPattern]::Pattern, [ref]$p)) { continue }
  if ($p.Current.IsTopmost -or $p.Current.WindowVisualState -eq 'Minimized') { continue }
  $front = $w
  break
}
if ($null -eq $front) { exit 0 }
$name = [System.Diagnostics.Process]::GetProcessById($front.Current.ProcessId).ProcessName.ToLower()
if ($browsers -notcontains $name) { exit 0 }
$edit = $null
if ($name -eq 'firefox') {
  $edit = $front.FindFirst($T::Descendants, (New-Object System.Windows.Automation.PropertyCondition($A::AutomationIdProperty, 'urlbar-input')))
}
if ($null -eq $edit) {
  $edit = $front.FindFirst($T::Descendants, (New-Object System.Windows.Automation.PropertyCondition($A::ControlTypeProperty, [System.Windows.Automation.ControlType]::Edit)))
}
if ($null -eq $edit) { exit 0 }
$v = $null
if (-not $edit.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern, [ref]$v)) { exit 0 }
@{ process = $name; url = $v.Current.Value } | ConvertTo-Json -Compress
`;

// Names the app owning the frontmost normal window (layer 0) that is not
// nvoke's. Owner names need no Screen Recording permission, only titles do.
const MAC_FRONT_APP = `
ObjC.import('CoreGraphics');
function run(argv) {
  const own = Number(argv[0]);
  const raw = $.CGWindowListCopyWindowInfo($.kCGWindowListOptionOnScreenOnly | $.kCGWindowListExcludeDesktopElements, $.kCGNullWindowID);
  const list = ObjC.deepUnwrap(ObjC.castRefToObject(raw)) || [];
  for (const w of list) {
    if (w.kCGWindowLayer !== 0 || w.kCGWindowOwnerPID === own) continue;
    return w.kCGWindowOwnerName || '';
  }
  return '';
}
`;

interface Run {
  stdout: string;
  stderr: string;
  failed: boolean;
}

function run(file: string, args: string[], timeout: number): Promise<Run> {
  return new Promise((resolve) => {
    execFile(file, args, { timeout, windowsHide: true, maxBuffer: 64 * 1024 }, (error, stdout, stderr) => {
      resolve({ stdout: String(stdout), stderr: String(stderr), failed: !!error });
    });
  });
}

async function readWindows(ownPid: number): Promise<FrontTab | null> {
  // The full path, so a powershell.exe earlier on PATH is never picked up.
  const exe = join(process.env['SystemRoot'] ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const script = WINDOWS_SCRIPT.replace('__PID__', String(Math.trunc(ownPid)));
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  const result = await run(exe, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], 5000);
  return result.failed ? null : parseWindowsHelper(result.stdout);
}

/** The app in front on macOS, by its name. Empty when it cannot tell. */
async function macFrontApp(ownPid: number): Promise<string> {
  const result = await run('/usr/bin/osascript', ['-l', 'JavaScript', '-e', MAC_FRONT_APP, String(Math.trunc(ownPid))], 3000);
  return result.failed ? '' : result.stdout.trim();
}

/**
 * Asks a macOS browser for its front tab's URL. The first time, macOS shows
 * its Automation prompt and this waits for the user's answer.
 */
export async function readMacTab(label: string, timeout = 3000): Promise<FrontTab | null> {
  const entry = Object.values(MAC_BROWSERS).find((b) => b.label === label);
  if (!entry) return null;
  const result = await run('/usr/bin/osascript', ['-e', entry.script], timeout);
  if (result.failed) return isAutomationDenied(result.stderr) ? { status: 'denied', browser: label } : null;
  const domain = tabDomain(result.stdout);
  return domain ? { status: 'read', browser: label, domain } : null;
}

export interface DetectOptions {
  /** nvoke's own process, whose windows are skipped. */
  ownPid: number;
  /** macOS: true once the user has been through the Automation prompt for this browser. */
  asked(browser: string): boolean;
}

/** The site in the front browser tab, a request to ask first (macOS), or null. Never throws. */
export async function detectFrontTab(options: DetectOptions): Promise<FrontTab | null> {
  try {
    if (process.platform === 'win32') return await readWindows(options.ownPid);
    if (process.platform === 'darwin') {
      const browser = macBrowser(await macFrontApp(options.ownPid));
      if (!browser) return null;
      if (!options.asked(browser)) return { status: 'ask', browser };
      return await readMacTab(browser);
    }
  } catch {
    // No tab row is the quiet answer to anything going wrong.
  }
  return null;
}
