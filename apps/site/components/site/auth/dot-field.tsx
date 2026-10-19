'use client';

import { useEffect, useRef } from 'react';
import { prefersReducedMotion } from '@/components/site/home/motion';
import { cn } from '@/lib/utils';

/* 5 by 7 dot matrix glyphs for the figure the field gathers into. */
const GLYPH: Record<string, string[]> = {
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
};

/* An 8 by 8 at sign: what the leads are, for the sign in page. */
export const AT_SIGN = ['.######.', '#......#', '#.####.#', '#.#..#.#', '#.#..#.#', '#.#####.', '#.......', '.######.'];

const COLS = 36;
const SCALE = 3;

type Dot = { x: number; y: number; lit: boolean; at: number; spark: number };

/** A figure as rows of dots: digits from the 5 by 7 glyphs with a blank column between them. */
function patternOf(figure: string): string[] {
  const glyphs = [...figure].map((c) => GLYPH[c] ?? GLYPH['0']!);
  return Array.from({ length: 7 }, (_, y) => glyphs.map((g) => g[y]).join('0'));
}

function layout(pattern: string[]): { dots: Dot[]; rows: number } {
  const width = Math.max(...pattern.map((row) => row.length)) * SCALE;
  const height = pattern.length * SCALE;
  const rows = Math.max(26, height + 4);
  const left = Math.floor((COLS - width) / 2);
  const top = Math.floor((rows - height) / 2);
  const lit = new Set<string>();
  pattern.forEach((row, y) =>
    [...row].forEach((bit, x) => {
      if (bit !== '1' && bit !== '#') return;
      for (let dy = 0; dy < SCALE; dy++)
        for (let dx = 0; dx < SCALE; dx++) lit.add(`${left + x * SCALE + dx},${top + y * SCALE + dy}`);
    }),
  );
  const dots: Dot[] = [];
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < COLS; x++) {
      const on = lit.has(`${x},${y}`);
      // Lit dots come on one by one, in a scattered order, over the first second and a half.
      dots.push({ x, y, lit: on, at: on ? 300 + Math.random() * 1500 : 0, spark: 0 });
    }
  return { dots, rows };
}

/**
 * The sign in and sign up field: a grid of dots printed on the paper that
 * gathers into a figure (the free allowance) or a pattern (the at sign), dot
 * by dot. Dots near the pointer light up in orange, and
 * now and then a stray dot sparks, like a lead being found. No black box:
 * the page itself is the display. Under reduced motion the figure stands
 * still.
 */
export function DotField({ figure, pattern, className }: { figure?: string; pattern?: string[]; className?: string }) {
  const shape = (pattern ?? patternOf(figure ?? '0')).join('|');
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext('2d');
    if (!el || !ctx) return;
    const { dots, rows: ROWS } = layout(shape.split('|'));
    const still = prefersReducedMotion();
    const pointer = { x: -1e4, y: -1e4 };
    let colors = { ink: '', primary: '' };
    let size = { w: 0, h: 0, step: 0, dpr: 1 };
    let frame = 0;
    let visible = true;
    const start = performance.now();

    function readColors(): void {
      const s = getComputedStyle(el!);
      colors = { ink: s.getPropertyValue('--foreground').trim(), primary: s.getPropertyValue('--primary').trim() };
    }
    function resize(): void {
      const w = el!.clientWidth;
      const step = w / COLS;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      size = { w, h: step * ROWS, step, dpr };
      el!.width = w * dpr;
      el!.height = size.h * dpr;
      el!.style.height = `${size.h}px`;
    }

    function draw(now: number): void {
      const t = still ? 1e6 : now - start;
      const { step, dpr } = size;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx!.clearRect(0, 0, size.w, size.h);
      const dot = step * 0.56;
      for (const d of dots) {
        const cx = d.x * step + step / 2;
        const cy = d.y * step + step / 2;
        const near = Math.max(0, 1 - Math.hypot(cx - pointer.x, cy - pointer.y) / (step * 5));
        if (!still && !d.lit && d.spark <= 0 && Math.random() < 0.0004) d.spark = 1;
        d.spark = Math.max(0, d.spark - 0.012);
        const on = d.lit ? Math.min(1, Math.max(0, (t - d.at) / 220)) : 0;
        let alpha = 0.07 + on * 0.83;
        let color = colors.ink;
        const warm = Math.max(near, d.spark);
        if (warm > 0.02 && on < 0.5) {
          color = colors.primary;
          alpha = Math.max(alpha, 0.15 + warm * 0.8);
        }
        ctx!.globalAlpha = alpha;
        ctx!.fillStyle = color;
        ctx!.fillRect(cx - dot / 2, cy - dot / 2, dot, dot);
      }
      ctx!.globalAlpha = 1;
    }

    function loop(now: number): void {
      if (visible && !document.hidden) draw(now);
      frame = requestAnimationFrame(loop);
    }

    readColors();
    resize();
    if (still) draw(performance.now());
    else frame = requestAnimationFrame(loop);

    const ro = new ResizeObserver(() => {
      resize();
      if (still) draw(performance.now());
    });
    ro.observe(el);
    const theme = new MutationObserver(() => {
      readColors();
      if (still) draw(performance.now());
    });
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    const io = new IntersectionObserver(([e]) => (visible = Boolean(e?.isIntersecting)));
    io.observe(el);
    const move = (e: PointerEvent): void => {
      const box = el.getBoundingClientRect();
      pointer.x = e.clientX - box.left;
      pointer.y = e.clientY - box.top;
    };
    const leave = (): void => {
      pointer.x = pointer.y = -1e4;
    };
    window.addEventListener('pointermove', move, { passive: true });
    document.addEventListener('pointerleave', leave);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      theme.disconnect();
      io.disconnect();
      window.removeEventListener('pointermove', move);
      document.removeEventListener('pointerleave', leave);
    };
  }, [shape]);

  return <canvas ref={canvas} aria-hidden="true" className={cn('block w-full', className)} />;
}
