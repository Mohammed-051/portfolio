/** Real preloader. A fixed manifest per mode, fetched once (shared items count in both), measured in bytes as they
 *  stream. Essentials gate the hero; the tail (world chunk, first GLB) streams behind it and never blocks. Lazy: only
 *  src/intro/intro.ts imports this. */
import bodoni from "../styles/fonts/bodoni-moda-latin-opsz-normal.woff2?url";
import caveat from "../styles/fonts/caveat-latin-500-basic.woff2?url";
import doto from "../styles/fonts/doto-latin-wght-normal.woff2?url";
import sans from "../styles/fonts/instrument-sans-latin-wght-normal.woff2?url";
import jersey from "../styles/fonts/jersey-25-latin-400-normal.woff2?url";
import mono from "../styles/fonts/jetbrains-mono-latin-wght-normal.woff2?url";
import news from "../styles/fonts/newsreader-latin-display-wght.woff2?url";
import type { Mode } from "../rr/store.ts";
import { eligible } from "../world/eligible.ts";

export interface Rec { name: string; tail: boolean; loaded: number; size: number | null; done: boolean; failed: boolean }
export const TIMEOUT = 10_000; // ms from navigation: past it the hero enters with what is loaded

const SIG = "/portrait/signature.svg";
const GLB = "/world/desk-kit-v2.glb"; // the tail's first model, the name world/glb.ts loads
const MANIFEST: Record<Mode, string[]> = {
  render: ["/portrait/portrait-ink.webp", SIG, bodoni, news, sans, caveat],
  raster: ["/portrait/portrait-px.png", "/portrait/portrait-px-raster.png", SIG, jersey, doto, mono],
};
const recs = new Map<string, Rec>();
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
const base = (u: string) => u.split("/").pop()!.replace(/-[\w-]{8}(?=\.woff2)/, "");

async function get(url: string, tail = false): Promise<void> {
  if (recs.has(url)) return;
  const r: Rec = { name: base(url), tail, loaded: 0, size: null, done: false, failed: false };
  recs.set(url, r);
  try {
    const res = await fetch(url);
    if (!res.ok || !res.body) throw new Error(String(res.status));
    // Content-Length is the encoded size; with a content-encoding the streamed (decoded) bytes would overrun it.
    const len = Number(res.headers.get("content-length"));
    if (len > 0 && !res.headers.get("content-encoding")) r.size = len;
    const rd = res.body.getReader();
    for (let c = await rd.read(); !c.done; c = await rd.read()) { r.loaded += c.value.length; emit(); }
    r.size = r.loaded;
  } catch { r.failed = true; } // skipped, never blocks
  r.done = true;
  emit();
}

/** The world chunk has no byte count: one manifest item, weighted like an average asset. */
async function mod(name: string, load: () => Promise<unknown>): Promise<void> {
  const r: Rec = { name, tail: true, loaded: 0, size: null, done: false, failed: false };
  recs.set(name, r);
  await load().catch(() => { r.failed = true; });
  r.done = true;
  emit();
}

let tailed = false;
/** Starts both manifests; the tail starts once either mode's essentials are in. Returns the per-mode essentials promises. */
export function start(): Record<Mode, Promise<void>> {
  const ess = (m: Mode) => Promise.all(MANIFEST[m].map((u) => get(u))).then(tail);
  return { render: ess("render"), raster: ess("raster") };
}
function tail() {
  if (tailed || !eligible()) return;
  tailed = true;
  void mod("world chunk", () => import("../world/core.ts"));
  void get(GLB, true);
}

/** Progress 0..1 of one mode's essentials, the set the hero waits for, so 100% means it can enter; the tail streams after
 *  it and only shows in `items`. Bytes where the size is known (Content-Length, or streamed once done); an item with no
 *  size yet weighs the mean known size (count weighting when nothing is known). `method` says which held. */
export function progress(m: Mode): { p: number; method: "bytes" | "bytes+count"; items: Rec[] } {
  const keys = MANIFEST[m];
  const items = keys.map((k) => recs.get(k) ?? { name: k, tail: false, loaded: 0, size: null, done: false, failed: false });
  const known = items.filter((r) => r.size !== null);
  const mean = known.length ? known.reduce((s, r) => s + r.size!, 0) / known.length : 1;
  let num = 0, den = 0;
  for (const r of items) {
    const w = r.size ?? mean;
    den += w;
    num += r.done ? w : Math.min(r.loaded, w);
  }
  return { p: num / den, method: items.every((r) => r.size !== null || r.failed) ? "bytes" : "bytes+count", items: [...keys, "world chunk", GLB].flatMap((k) => recs.get(k) ?? []) };
}

/** Gate for the counter: the world chunk landed, or this device never loads it. */
export const tailDone = () => !eligible() || !!recs.get("world chunk")?.done;

export const onProgress = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
