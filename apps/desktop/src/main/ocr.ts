import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { splitColumns, type OcrWord } from './grab-extract';

/**
 * Reads the text in an image on this computer, with the text engine the OS
 * already has: Windows.Media.Ocr through Windows PowerShell on Windows, the
 * Vision framework through JavaScript for Automation on macOS, and the
 * `tesseract` command on Linux when it is installed. Nothing is bundled and
 * nothing goes over the network. The image is a temp file for the few
 * seconds the engine needs and is deleted after.
 *
 * Returns segments: one per line, or one per column when a line has wide gaps.
 */

export class OcrUnavailable extends Error {}

const TIMEOUT_MS = 30_000;

export async function recognize(png: Buffer): Promise<string[]> {
  const file = join(tmpdir(), `nvoke-grab-${randomBytes(8).toString('hex')}.png`);
  await writeFile(file, png);
  try {
    if (process.platform === 'win32') return await windowsOcr(file);
    if (process.platform === 'darwin') return await visionOcr(file);
    return await tesseractOcr(file);
  } finally {
    await rm(file, { force: true });
  }
}

function run(command: string, args: string[], env?: NodeJS.ProcessEnv): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      { timeout: TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024, windowsHide: true, encoding: 'utf8', env: env ? { ...process.env, ...env } : process.env },
      (error, stdout) => (error ? reject(error) : resolve(stdout)),
    );
  });
}

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | null)?.code === 'ENOENT';
}

/**
 * Windows 10 and 11 ship an OCR engine for every installed display language.
 * PowerShell 5.1 can reach WinRT, so a short script reads the file and prints
 * each line's words with their positions as JSON.
 */
const WINDOWS_SCRIPT = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
$null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics, ContentType = WindowsRuntime]
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1' })[0]
function Await($op, [Type]$type) { $t = $asTask.MakeGenericMethod($type).Invoke($null, @($op)); $null = $t.Wait(-1); $t.Result }
$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
if ($null -eq $engine) { Write-Output '{"error":"no-language"}'; exit 0 }
$file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($env:NVOKE_OCR_IMAGE)) ([Windows.Storage.StorageFile])
$stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
$decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
$bitmap = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
$result = Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
$lines = @($result.Lines | ForEach-Object { ,@($_.Words | ForEach-Object { ,@($_.Text, $_.BoundingRect.X, $_.BoundingRect.Width, $_.BoundingRect.Height) }) })
$stream.Dispose()
ConvertTo-Json -InputObject @{ lines = $lines } -Depth 6 -Compress
`;

type WindowsWord = [string, number, number, number];

async function windowsOcr(file: string): Promise<string[]> {
  const encoded = Buffer.from(WINDOWS_SCRIPT, 'utf16le').toString('base64');
  let out: string;
  try {
    out = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], {
      NVOKE_OCR_IMAGE: file,
    });
  } catch (error) {
    if (isMissing(error)) throw new OcrUnavailable('Windows PowerShell is missing, so Windows OCR cannot run.');
    throw error;
  }
  const parsed = JSON.parse(out.trim()) as { error?: string; lines?: unknown };
  if (parsed.error) throw new OcrUnavailable('Windows has no OCR language installed. Add one under Settings, Time and language, Language.');
  return windowsSegments(parsed.lines);
}

/** PowerShell collapses one-element arrays, so every level may be a value or a list. */
function asList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : value === null || value === undefined ? [] : [value];
}

export function windowsSegments(lines: unknown): string[] {
  const segments: string[] = [];
  for (const rawLine of asList(lines)) {
    let wordsRaw = asList(rawLine);
    // A one-word line arrives as the word itself: [text, x, width, height].
    if (typeof wordsRaw[0] === 'string') wordsRaw = [wordsRaw];
    const words = wordsRaw.filter((w): w is WindowsWord => Array.isArray(w) && typeof w[0] === 'string' && w.length >= 4);
    if (words.length === 0) continue;
    const heights = words.map((w) => Number(w[3]) || 0).sort((a, b) => a - b);
    const height = heights[Math.floor(heights.length / 2)] ?? 0;
    const ocrWords: OcrWord[] = words.map((w) => ({ text: w[0], x: Number(w[1]) || 0, width: Number(w[2]) || 0 }));
    segments.push(...splitColumns(ocrWords, Math.max(12, height * 1.6)));
  }
  return segments;
}

/**
 * macOS 10.15 and later: VNRecognizeTextRequest through the Objective-C
 * bridge of JavaScript for Automation, so no Swift toolchain or helper binary.
 * Vision returns one observation per block of text, which already keeps
 * columns apart. Sorted top to bottom, then left to right.
 */
const VISION_SCRIPT = `
ObjC.import('Foundation');
ObjC.import('Vision');
function run(argv) {
  const url = $.NSURL.fileURLWithPath(argv[0]);
  const handler = $.VNImageRequestHandler.alloc.initWithURLOptions(url, $.NSDictionary.dictionary);
  const request = $.VNRecognizeTextRequest.alloc.init;
  request.recognitionLevel = 0;
  request.usesLanguageCorrection = true;
  handler.performRequestsError($.NSArray.arrayWithObject(request), null);
  const results = request.results;
  const out = [];
  const count = results.count;
  for (let i = 0; i < count; i++) {
    const observation = results.objectAtIndex(i);
    const candidate = observation.topCandidates(1).firstObject;
    if (!candidate) continue;
    let x = 0, y = 0;
    try { const box = observation.boundingBox; x = box.origin.x; y = 1 - box.origin.y - box.size.height; } catch (e) {}
    out.push({ text: candidate.string.js, x: x, y: y });
  }
  return JSON.stringify(out);
}
`;

async function visionOcr(file: string): Promise<string[]> {
  let out: string;
  try {
    out = await run('/usr/bin/osascript', ['-l', 'JavaScript', '-e', VISION_SCRIPT, file]);
  } catch (error) {
    if (isMissing(error)) throw new OcrUnavailable('osascript is missing, so Vision text recognition cannot run.');
    throw new OcrUnavailable('Text recognition needs macOS 10.15 or later.');
  }
  const blocks = JSON.parse(out.trim()) as { text: string; x: number; y: number }[];
  // Rows within about a line of each other read left to right.
  blocks.sort((a, b) => (Math.abs(a.y - b.y) < 0.01 ? a.x - b.x : a.y - b.y));
  return blocks.map((b) => b.text);
}

/** Linux has no OS engine, so use tesseract when the user has it. Sparse text mode suits lists and grids. */
async function tesseractOcr(file: string): Promise<string[]> {
  try {
    const out = await run('tesseract', [file, 'stdout', '--psm', '11']);
    return out.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  } catch (error) {
    if (isMissing(error)) throw new OcrUnavailable('Install tesseract (for example `sudo apt install tesseract-ocr`) to read text on Linux.');
    throw error;
  }
}
