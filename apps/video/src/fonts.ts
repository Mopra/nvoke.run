import { loadFont as loadInterTight } from '@remotion/google-fonts/InterTight';
import { loadFont as loadInter } from '@remotion/google-fonts/Inter';
import { loadFont as loadGeistMono } from '@remotion/google-fonts/GeistMono';

/**
 * Inter Tight is Inter cut for display sizes (tighter default spacing), so the
 * big type sits like SF Pro Display. Inter for small text, Geist Mono for
 * domains and emails (the site already ships Geist). Remotion waits for every
 * font before it captures a frame.
 */
const display = loadInterTight('normal', { weights: ['500', '600'], subsets: ['latin'] });
const text = loadInter('normal', { weights: ['400', '500'], subsets: ['latin'] });
const mono = loadGeistMono('normal', { weights: ['400', '500'], subsets: ['latin'] });

export const fonts = {
  display: `${display.fontFamily}, system-ui, sans-serif`,
  text: `${text.fontFamily}, system-ui, sans-serif`,
  mono: `${mono.fontFamily}, ui-monospace, monospace`,
};
