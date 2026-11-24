// Plate cache: base canvases keyed id|mode|w|h|dpr|fontGen, LRU, byte and entry capped.
// Every base is also a cache member of the one canvas registry (canvasBudget), which may evict it first.
import * as budget from "./canvasBudget.ts";

export interface PlateEntry {
  key: string;
  base: HTMLCanvasElement | null; // null: the build threw, so the slot shows its pending label until the key changes
  bytes: number;
  lastUsed: number;
  state: "ok" | "error";
}

const MB = 1024 * 1024;
const MAX_ENTRIES = 12;
const limit = (): number => (matchMedia("(pointer: coarse)").matches ? 24 : 48) * MB;

const map = new Map<string, PlateEntry>();
let clock = 0;

export const bytesOf = (c: HTMLCanvasElement): number => c.width * c.height * 4;

export const cache = {
  get(k: string): PlateEntry | undefined {
    const e = map.get(k);
    if (e) {
      e.lastUsed = ++clock;
      if (e.base) budget.touch(e.base);
    }
    return e;
  },

  /** Stores e, then evicts least recently used entries (never e) until bytes and count fit. */
  put(e: PlateEntry): void {
    e.lastUsed = ++clock;
    map.set(e.key, e);
    for (;;) {
      let total = 0;
      let lru: PlateEntry | undefined;
      for (const x of map.values()) {
        total += x.bytes;
        if (x !== e && (!lru || x.lastUsed < lru.lastUsed)) lru = x;
      }
      if (!lru || (total <= limit() && map.size <= MAX_ENTRIES)) return;
      cache.dispose(lru.key);
    }
  },

  /** Drops an entry the canvas registry already released. */
  forget(k: string): void {
    map.delete(k);
  },

  dispose(k: string): void {
    const e = map.get(k);
    map.delete(k);
    if (e?.base) budget.release(e.base);
  },

  disposeWhere(match: (k: string) => boolean): void {
    for (const k of [...map.keys()]) if (match(k)) cache.dispose(k);
  },

  clear(): void {
    for (const k of [...map.keys()]) cache.dispose(k);
  },
};
