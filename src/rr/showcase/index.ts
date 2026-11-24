// "From a line to pixels": the controller for the four self-playing demos. Showcase.tsx renders the DOM and the copy;
// this module owns the canvases, the clock and the readout. The clock only ever runs or stops: visibility, the tab and
// the Play button start and pause it. Nothing here reads the scroll position.
import * as budget from "../canvasBudget.ts";
import { token } from "../refresh.ts";
import { store } from "../store.ts";
import { bresScene, circleScene, ddaScene } from "./scenes.ts";
import type { Env, Row, Scene } from "./types.ts";

export interface ShowcaseHost {
  signal: AbortSignal;
  stage: HTMLElement;       // sizes the figure; observed for visibility
  canvas: HTMLCanvasElement; // the figure
  fx: HTMLCanvasElement;     // transparent overlay for the live geometry
  out: HTMLElement;          // readout <dl>
  onState(playing: boolean): void;
}
export interface ShowcaseHandle { setTab(i: number): void; toggle(): void; replay(): void }

const MONO = `"JetBrains Mono Variable", ui-monospace, Consolas, monospace`;
const REST = 1800; // ms a finished loop holds before the next endpoints
const FACTORIES: (() => Scene | Promise<Scene>)[] = [
  () => import("./portrait.ts").then((m) => m.portraitScene()),
  () => bresScene(), () => ddaScene(), () => circleScene(),
];

export function create(host: ShowcaseHost): ShowcaseHandle {
  const { signal, stage, canvas, fx, out, onState } = host;
  const cx = canvas.getContext("2d")!, fc = fx.getContext("2d")!;
  const cache: (Scene | undefined)[] = [];
  let scene: Scene | undefined, want = 0, cs = 0, t = 0, rest = 0, last = 0, raf = 0, outKey = "", outAt = 0;
  let vis = false, paused = false, done = false, stale = false, env: Env;

  const reduced = () => store.get().motion === "reduced";
  const running = () => !!scene && vis && !document.hidden && !paused && !done && !reduced();
  const playing = () => !paused && !done && !reduced();
  const readEnv = (): Env => ({
    raster: store.get().mode === "raster", ink: token("--ink"), ink2: token("--ink-2"), rule: token("--rule"),
    sig: token("--signal"), paper: token("--paper"), panel: token("--panel"), mute: token("--mute"), font: MONO,
  });
  const unreg = [budget.register(canvas, { visible: () => vis, onEvict: () => { stale = true; } }), budget.register(fx)];

  function write(rows: Row[], force: boolean) {
    const key = rows.map((r) => r[0] + "\u0001" + r[1]).join("\u0002"), now = performance.now();
    if (key === outKey || (!force && now - outAt < 80)) return;
    outKey = key;
    outAt = now;
    out.replaceChildren(...rows.flatMap(([a, b]) => {
      const dt = document.createElement("dt"), dd = document.createElement("dd");
      dt.textContent = a;
      dd.textContent = b;
      return [dt, dd];
    }));
  }

  function draw(force = false) {
    if (!scene || !cs) return;
    const tt = reduced() ? scene.duration : Math.min(t, scene.duration);
    scene.paint(cx, fc, cs, tt, env);
    write(scene.read(tt), force || tt >= scene.duration);
  }

  function layout() {
    if (!scene) return;
    stale = false;
    cs = Math.max(1, Math.min(Math.floor(stage.clientWidth / scene.cols), Math.floor((innerHeight * 0.7) / scene.rows)));
    const w = scene.cols * cs, h = scene.rows * cs;
    const pref = Math.min(devicePixelRatio || 1, matchMedia("(max-width: 767px)").matches ? 1.5 : 2);
    const dpr = budget.size(canvas, w, h, pref);
    budget.size(fx, w, h, dpr);
    for (const [c, x] of [[canvas, cx], [fx, fc]] as const) {
      c.style.width = `${w}px`;
      c.style.height = `${h}px`;
      x.setTransform(dpr, 0, 0, dpr, 0, 0);
      x.clearRect(0, 0, w, h);
    }
    env = readEnv();
    scene.invalidate?.();
    draw(true);
  }

  function frame(now: number) {
    raf = 0;
    if (!running() || !scene) return;
    const dt = Math.min(64, now - last);
    last = now;
    if (t < scene.duration) t += dt;
    else if (!scene.loop) { done = true; draw(true); onState(false); return; }
    else if ((rest += dt) >= REST) { scene.next?.(); t = 0; rest = 0; }
    draw();
    raf = requestAnimationFrame(frame);
  }
  const kick = () => {
    if (raf || !running()) return;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  };

  async function setTab(i: number) {
    want = i;
    const had = cache[i];
    const s = (cache[i] ??= await FACTORIES[i]!());
    if (want !== i || signal.aborted) return;
    if (had) s.next?.(); // a revisit plays new endpoints
    scene = s;
    t = rest = 0;
    paused = done = false;
    outKey = "";
    layout();
    onState(playing());
    kick();
  }
  function replay() {
    t = rest = 0;
    paused = done = false;
    scene?.invalidate?.();
    onState(playing());
    draw(true);
    kick();
  }
  function toggle() {
    if (done) return replay();
    paused = !paused;
    onState(playing());
    if (paused) draw(true);
    else kick();
  }

  const io = new IntersectionObserver((es) => {
    vis = es.some((e) => e.isIntersecting);
    if (vis && stale) layout();
    if (vis) kick();
  }, { threshold: 0.15 });
  io.observe(stage);
  const ro = new ResizeObserver(() => layout());
  ro.observe(stage);
  const ac = new AbortController();
  document.addEventListener("visibilitychange", kick, { signal: ac.signal });
  const refresh = () => { env = readEnv(); scene?.invalidate?.(); draw(true); };
  const offs = [
    store.subscribe("mode", refresh), store.subscribe("fontGen", refresh),
    store.subscribe("motion", () => { onState(playing()); draw(true); kick(); }),
  ];

  env = readEnv();
  signal.addEventListener("abort", () => {
    ac.abort();
    io.disconnect();
    ro.disconnect();
    cancelAnimationFrame(raf);
    offs.forEach((f) => f());
    unreg.forEach((f) => f());
    budget.release(canvas);
    budget.release(fx);
  }, { once: true });
  return { setTab: (i) => void setTab(i).catch(() => {}), toggle, replay };
}
