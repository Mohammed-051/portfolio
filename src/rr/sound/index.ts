/** Synthesised cues. Lazy: rr/sfx.ts loads this on the first real gesture made while sound is on. No audio
 *  files. Render: band-passed noise ticks (paper, pencil). Raster: short square blips. One source per cue, each under
 *  200 ms, peak gain 0.08, 120 ms minimum gap (a cue inside the gap is dropped), none on hover. The AudioContext is made
 *  on the first cue after a gesture, never while sound is off, and suspended when sound turns off. */
import { store, type Mode } from "../store.ts";

type Cue = "key" | "mode" | "intro" | "sig" | "copy" | "toggle" | "arrive";
const PEAK = 0.08, GAP = 120; // gain, ms
// Render: band centre Hz, Q, length s, peak. Raster: square Hz per step, step s, peak (square reads louder than noise).
const PAPER: Record<Cue, [number, number, number, number]> = {
  key: [3200, 1.2, 0.035, 0.05],
  mode: [1400, 0.7, 0.12, 0.07],
  intro: [1800, 0.8, 0.16, 0.08],
  sig: [5200, 2.5, 0.18, 0.04],
  copy: [2400, 1, 0.06, 0.06],
  toggle: [2800, 1, 0.05, 0.06],
  arrive: [900, 0.6, 0.09, 0.02],
};
const GRID: Record<Cue, [number[], number, number]> = {
  key: [[880], 0.03, 0.035],
  mode: [[440, 660], 0.05, 0.045],
  intro: [[330, 495, 660], 0.05, 0.05],
  sig: [[1320, 1760], 0.04, 0.03],
  copy: [[990, 1320], 0.04, 0.045],
  toggle: [[660, 990], 0.04, 0.045],
  arrive: [[220], 0.05, 0.015],
};
if (import.meta.env.DEV) for (const k of Object.keys(PAPER) as Cue[]) {
  const [, , len, p] = PAPER[k], [fs, step, q] = GRID[k];
  console.assert(len < 0.2 && fs.length * step < 0.2 && p <= PEAK && q <= PEAK, `sound: cue ${k} over 200 ms or gain 0.08`);
}

let ctx: AudioContext | undefined, noise: AudioBuffer | undefined, last = -Infinity, started = false;

function audio(): AudioContext | undefined {
  if (store.get().sound !== "on" || !navigator.userActivation?.hasBeenActive) return;
  if (!ctx) {
    ctx = new AudioContext();
    noise = ctx.createBuffer(1, ctx.sampleRate * 0.4, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function play(cue: Cue, mode: Mode = store.get().mode): void {
  const now = performance.now();
  if (now - last < GAP || (cue === "arrive" && store.get().motion === "reduced")) return;
  const c = audio();
  if (!c) return;
  last = now;
  const t = c.currentTime + 0.005, g = c.createGain();
  const env = (len: number, peak: number) => {
    g.gain.value = 0;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(Math.min(peak, PEAK), t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    g.connect(c.destination);
    return t + len;
  };
  let src: AudioScheduledSourceNode, end: number;
  if (mode === "render") {
    const [f, q, len, peak] = PAPER[cue], s = c.createBufferSource(), b = c.createBiquadFilter();
    s.buffer = noise!;
    b.type = "bandpass";
    b.frequency.value = f;
    b.Q.value = q;
    s.connect(b).connect(g);
    end = env(len, peak);
    s.start(t, Math.random() * 0.2); // a different stretch of grain each time
    src = s;
  } else {
    const [fs, step, peak] = GRID[cue], o = c.createOscillator();
    o.type = "square";
    fs.forEach((f, i) => o.frequency.setValueAtTime(f, t + i * step)); // stepped pitch, never glides
    o.connect(g);
    end = env(fs.length * step, peak);
    o.start(t);
    src = o;
  }
  src.stop(end);
  src.onended = () => g.disconnect();
}

function onClick(e: Event): void {
  const el = (e.target as Element | null)?.closest?.("[data-sfx]");
  const k = el?.getAttribute("data-sfx");
  // The mode key voices the mode it switches to; "toggle" (intro sound key) is voiced by the store change below.
  if (k === "mode") { if (!store.get().modeBusy) play("mode", store.get().mode === "raster" ? "render" : "raster"); }
  else if (k === "intro") play("intro", (el as HTMLElement).dataset["pick"] === "raster" ? "raster" : "render");
  else if (k === "key" || k === "copy") play(k);
}

/** Called by the loader with the event that loaded this chunk, so that first press is voiced too. */
export function start(first: Event): void {
  if (started) return;
  started = true;
  addEventListener("click", onClick, true);
  addEventListener("rr:sig", () => play("sig"));
  store.subscribe("sound", (s) => (s.sound === "on" ? play("toggle") : void ctx?.suspend()));
  let sec = store.get().currentSection; // last section voiced; a null in between (fast jumps) is not an arrival
  store.subscribe("currentSection", (s) => { if (s.currentSection && s.currentSection !== sec) { sec = s.currentSection; play("arrive"); } });
  if (first.type === "click") onClick(first);
  else if (first.type === "rr:sound") play("toggle");
}
