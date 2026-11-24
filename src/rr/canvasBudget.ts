// One byte registry for every display canvas and plate cache base.
type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;
interface Opts {
  cache?: boolean;             // plate cache base: evicted first, least recently used
  visible?: () => boolean;     // display canvas: when false, its backing store may be released
  onEvict?: () => void;        // owner drops a cache entry, or marks a display canvas stale
}
interface Entry extends Opts { bytes: number; lastUsed: number }

const MB = 1024 * 1024;
export const PIXEL_CAP = 4_194_304; // per canvas, w * h * dpr^2
const DPR_STEPS = [2, 1.5, 1];
const entries = new Map<AnyCanvas, Entry>();
let clock = 0;

export const budget = (): number => (matchMedia("(pointer: coarse)").matches ? 48 : 96) * MB;
export const total = (): number => { let t = 0; for (const e of entries.values()) t += e.bytes; return t; };
export const liveContexts = (): number => entries.size;

export function register(c: AnyCanvas, o: Opts = {}): () => void {
  entries.set(c, { ...o, bytes: c.width * c.height * 4, lastUsed: ++clock });
  return () => { entries.delete(c); };
}

/** Marks a cache entry as used (LRU). */
export function touch(c: AnyCanvas): void {
  const e = entries.get(c);
  if (e) e.lastUsed = ++clock;
}

/** Re-reads the real backing size after an owner resized c directly. */
export function update(c: AnyCanvas): void {
  const e = entries.get(c);
  if (e) e.bytes = c.width * c.height * 4;
}

/** Releases the backing store; removes the node when the caller owns it. */
export function release(c: AnyCanvas, remove = false): void {
  entries.delete(c);
  c.width = c.height = 0;
  if (remove && "remove" in c) c.remove();
}

function freeOne(skip: AnyCanvas): boolean {
  let lru: [AnyCanvas, Entry] | undefined;
  for (const kv of entries) if (kv[1].cache && kv[0] !== skip && (!lru || kv[1].lastUsed < lru[1].lastUsed)) lru = kv;
  if (lru) { release(lru[0]); lru[1].onEvict?.(); return true; }
  for (const [c, e] of entries) {
    if (c === skip || e.cache || !e.bytes || !e.visible || e.visible()) continue;
    c.width = c.height = 0;
    e.bytes = 0;
    e.onEvict?.();
    return true;
  }
  return false;
}

/**
 * Sizes a registered canvas to round(css * dpr), applying the per-canvas pixel cap and the total budget
 * (evict cache LRU, then release hidden canvases, then lower dpr 2 -> 1.5 -> 1). Returns the dpr used.
 */
export function size(c: AnyCanvas, cssW: number, cssH: number, dpr: number): number {
  const area = Math.max(1, cssW * cssH);
  let d = Math.min(dpr, Math.sqrt(PIXEL_CAP / area));
  const bytes = (x: number) => Math.round(cssW * x) * Math.round(cssH * x) * 4;
  const own = () => entries.get(c)?.bytes ?? 0;
  while (total() - own() + bytes(d) > budget()) {
    if (freeOne(c)) continue;
    const next = DPR_STEPS.find((s) => s < d);
    // shortcut: at dpr 1 the canvas is allocated even over budget, warn instead of failing; revisit if the warning shows up
    if (next === undefined) { if (import.meta.env?.DEV) console.warn("[rr] canvas budget exceeded at dpr 1"); break; }
    d = next;
  }
  const w = Math.round(cssW * d), h = Math.round(cssH * d);
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  update(c);
  return d;
}
