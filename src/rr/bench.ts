// Bench: Bresenham, DDA and the midpoint circle re-plotted one cell at a time.
// The DOM (tabs, handles, readout list, canvas) is rendered by Bench.tsx; this module draws and moves things.
import { UI } from "../lib/site";
import * as budget from "./canvasBudget.ts";
import { circle } from "./plates.ts";
import type { Handle } from "./registry.ts";
import { loadGsap, token } from "./refresh.ts";
import { store } from "./store.ts";

export type BenchAlgo = "bresenham" | "dda" | "midpoint-circle";
export interface BenchHandle extends Handle {
  setAlgo(a: BenchAlgo): void;
  play(): void;
  redraw(): void;
}
type Key = "A" | "B" | "C" | "R";
type Cell = [number, number, number, number?, number?]; // x, y, error or decision, then DDA exact point or circle octant x, y
export interface BenchHost {
  signal: AbortSignal;
  wrap: HTMLElement;
  canvas: HTMLCanvasElement;
  out: HTMLElement; // the readout <dl>
  legendLine: HTMLElement; // "Ideal line" or "Ideal circle"
  handles: Record<Key, HTMLElement>;
}

// One grid and one starting line at every width.
export const COLS = 28, ROWS = 24;
export const LINE0 = { A: [3, 18] as [number, number], B: [24, 5] as [number, number] };
/** Cell size in CSS px for a wrap width; capped so the canvas stays under 70% of the viewport height. */
export const cellSize = (w: number) => Math.max(1, Math.min(Math.floor(w / COLS), Math.floor((innerHeight * 0.7) / ROWS)));

export function bres(x0: number, y0: number, x1: number, y1: number): Cell[] {
  const out: Cell[] = [];
  const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1, dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
  let err = dx + dy, g = 0;
  for (;;) {
    out.push([x0, y0, err]);
    if ((x0 === x1 && y0 === y1) || ++g > 4000) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
  return out;
}

function dda(x0: number, y0: number, x1: number, y1: number): Cell[] {
  const out: Cell[] = [];
  const dx = x1 - x0, dy = y1 - y0, n = Math.max(Math.abs(dx), Math.abs(dy)) || 1;
  const xi = dx / n, yi = dy / n;
  let x = x0, y = y0;
  for (let i = 0; i <= n; i++) { out.push([Math.round(x), Math.round(y), 0, +x.toFixed(2), +y.toFixed(2)]); x += xi; y += yi; }
  return out;
}

// Self-check on the default endpoints: one cell per major-axis step, no gaps.
if (import.meta.env.DEV) {
  const c = bres(5, 23, 41, 6);
  console.assert(
    c.length === 37 && c.every((p, i) => !c[i - 1] || Math.max(Math.abs(p[0] - c[i - 1]![0]), Math.abs(p[1] - c[i - 1]![1])) === 1),
    "Bench: Bresenham line is wrong",
  );
  console.assert(dda(5, 23, 41, 6).length === 37, "Bench: DDA line is wrong");
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const R = UI.bench.readout;

export async function create(host: BenchHost): Promise<BenchHandle> {
  const { signal, wrap, canvas, out, legendLine, handles } = host;
  const x = canvas.getContext("2d");
  if (!x) throw new Error("bench: 2d context unavailable");
  const { gsap } = await loadGsap();
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");

  const cols = COLS, rows = ROWS;
  let cs = 0;
  let algo: BenchAlgo = "bresenham";
  let shown = Infinity; // cells drawn so far; Infinity is the final frame
  let vis = false, stale = false, dead = false;
  let tween: ReturnType<typeof gsap.to> | undefined;
  const P: Record<Key, [number, number]> = { A: [...LINE0.A], B: [...LINE0.B], C: [14, 12], R: [20, 12] };
  const unreg = budget.register(canvas, { visible: () => vis, onEvict: () => { stale = true; } });

  const isLine = () => algo !== "midpoint-circle";
  const radius = () => Math.max(1, Math.round(Math.hypot(P.R[0] - P.C[0], P.R[1] - P.C[1])));
  const plot = (): Cell[] => (algo === "bresenham" ? bres(...P.A, ...P.B) : algo === "dda" ? dda(...P.A, ...P.B) : circle(...P.C, radius()));
  const reduced = () => store.get().motion === "reduced";

  function layout() {
    const w = wrap.clientWidth;
    if (!w) return;
    cs = cellSize(w);
    const cssW = cols * cs, cssH = rows * cs;
    const want = Math.min(devicePixelRatio || 1, matchMedia("(max-width: 767px)").matches ? 1.5 : 2);
    const dpr = budget.size(canvas, cssW, cssH, want);
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    x!.setTransform(dpr, 0, 0, dpr, 0, 0);
    budget.update(canvas);
    stale = false;
    draw();
  }

  function draw() {
    if (!cs || dead) return;
    const ink = token("--ink"), rule = token("--rule"), sig = token("--signal");
    const W = cols * cs, H = rows * cs;
    x!.clearRect(0, 0, W, H);
    x!.fillStyle = rule;
    for (let i = 0; i <= cols; i++) x!.fillRect(i * cs, 0, 1, H);
    for (let j = 0; j <= rows; j++) x!.fillRect(0, j * cs, W, 1);
    const cells = plot();
    const n = Math.min(cells.length, shown);
    for (let i = 0; i < n; i++) {
      const [cx, cy] = cells[i]!;
      if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) continue;
      x!.fillStyle = i === n - 1 && n < cells.length ? sig : ink;
      x!.fillRect(cx * cs + 1, cy * cs + 1, cs - 1, cs - 1);
    }
    // The ideal geometry the cells approximate.
    x!.strokeStyle = sig;
    x!.lineWidth = 1.5;
    x!.beginPath();
    if (isLine()) { x!.moveTo((P.A[0] + 0.5) * cs, (P.A[1] + 0.5) * cs); x!.lineTo((P.B[0] + 0.5) * cs, (P.B[1] + 0.5) * cs); }
    else x!.arc((P.C[0] + 0.5) * cs, (P.C[1] + 0.5) * cs, radius() * cs, 0, Math.PI * 2);
    x!.stroke();
    budget.touch(canvas);
    readout(cells, n);
    place();
  }

  function readout(cells: Cell[], n: number) {
    const rowsOut: [string, string][] = [];
    const cur = cells[Math.max(0, n - 1)];
    const v = (i: 0 | 1 | 2 | 3 | 4): string => (cur?.[i] === undefined ? "-" : String(cur[i]));
    if (isLine()) {
      const dx = P.B[0] - P.A[0], dy = P.B[1] - P.A[1];
      rowsOut.push([R.line, `A(${P.A[0]}, ${P.A[1]}) to B(${P.B[0]}, ${P.B[1]})`], [R.delta, `${dx}, ${dy}`], [R.cells, `${n} of ${cells.length}`]);
      if (algo === "bresenham") rowsOut.push([R.err, v(2)]);
      else {
        const s = Math.max(Math.abs(dx), Math.abs(dy)) || 1;
        rowsOut.push([R.inc, `x ${(dx / s).toFixed(3)}, y ${(dy / s).toFixed(3)}`], [R.exact, `(${v(3)}, ${v(4)})`]);
      }
      const a = new Set(bres(...P.A, ...P.B).map((c) => `${c[0]},${c[1]}`));
      const diff = dda(...P.A, ...P.B).filter((c) => !a.has(`${c[0]},${c[1]}`)).length;
      rowsOut.push([R.other, diff ? `${diff} cell${diff > 1 ? "s" : ""} differ` : R.same]);
    } else {
      rowsOut.push([R.circle, `C(${P.C[0]}, ${P.C[1]}), r ${radius()}`], [R.cells, `${n} of ${cells.length}`], [R.decision, v(2)], [R.octant, `${v(3)}, ${v(4)}`]);
    }
    out.replaceChildren(
      ...rowsOut.flatMap(([a, b]) => {
        const dt = document.createElement("dt"), dd = document.createElement("dd");
        dt.textContent = a;
        dd.textContent = b;
        return [dt, dd];
      }),
    );
    legendLine.textContent = isLine() ? UI.bench.legend.line : UI.bench.legend.circle;
    const name = UI.bench.algos[algo === "bresenham" ? "bres" : algo === "dda" ? "dda" : "circ"];
    canvas.setAttribute(
      "aria-label",
      `${UI.bench.canvas}. ${name}, ${isLine() ? `from A(${P.A[0]}, ${P.A[1]}) to B(${P.B[0]}, ${P.B[1]})` : `centre C(${P.C[0]}, ${P.C[1]}), radius ${radius()}`}`,
    );
  }

  function place() {
    const on: Record<Key, boolean> = { A: isLine(), B: isLine(), C: !isLine(), R: !isLine() };
    for (const k of Object.keys(handles) as Key[]) {
      const h = handles[k], [i, j] = P[k];
      h.hidden = !on[k];
      h.style.transform = `translate(${(i + 0.5) * cs}px, ${(j + 0.5) * cs}px) translate(-50%, -50%)`;
      h.setAttribute("aria-label", `${UI.bench.handle[k]}, column ${i}, row ${j}`);
    }
  }

  const stop = () => { tween?.kill(); tween = undefined; shown = Infinity; };

  function play() {
    stop();
    if (dead) return;
    if (reduced()) { draw(); return; }
    const total = plot().length;
    const state = { k: 0 };
    shown = 0;
    tween = gsap.to(state, {
      k: total,
      duration: clamp(total * 0.028, 0.6, 2.4),
      ease: "none",
      onUpdate: () => { shown = Math.ceil(state.k); draw(); },
      onComplete: () => { tween = undefined; shown = Infinity; draw(); },
    });
    if (!vis) tween.pause();
    draw();
  }

  function setAlgo(a: BenchAlgo) {
    algo = a;
    play();
  }

  const cellAt = (e: PointerEvent): [number, number] => {
    const r = canvas.getBoundingClientRect();
    return [clamp(Math.floor((e.clientX - r.left) / cs), 0, cols - 1), clamp(Math.floor((e.clientY - r.top) / cs), 0, rows - 1)];
  };

  const ac = new AbortController();
  const opt = { signal: ac.signal };
  for (const k of Object.keys(handles) as Key[]) {
    const h = handles[k];
    h.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      h.setPointerCapture(e.pointerId);
      h.focus({ preventScroll: true });
      stop();
      const mv = (ev: PointerEvent) => { P[k] = cellAt(ev); draw(); };
      const up = () => { h.removeEventListener("pointermove", mv); h.removeEventListener("pointerup", up); h.removeEventListener("pointercancel", up); };
      h.addEventListener("pointermove", mv);
      h.addEventListener("pointerup", up);
      h.addEventListener("pointercancel", up);
    }, opt);
    h.addEventListener("keydown", (e) => {
      const d = ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] } as Record<string, [number, number]>)[e.key];
      if (!d) return;
      e.preventDefault();
      const m = e.shiftKey ? 5 : 1;
      P[k] = [clamp(P[k][0] + d[0] * m, 0, cols - 1), clamp(P[k][1] + d[1] * m, 0, rows - 1)];
      stop();
      draw();
    }, opt);
  }
  // A tap on the grid moves the nearer handle.
  canvas.addEventListener("click", (e) => {
    const c = cellAt(e);
    const keys: Key[] = isLine() ? ["A", "B"] : ["C", "R"];
    const [k1, k2] = keys as [Key, Key];
    const near = Math.hypot(P[k1][0] - c[0], P[k1][1] - c[1]) <= Math.hypot(P[k2][0] - c[0], P[k2][1] - c[1]) ? k1 : k2;
    P[near] = c;
    stop();
    draw();
  }, opt);

  const ro = new ResizeObserver(layout);
  ro.observe(wrap);
  const io = new IntersectionObserver((es) => {
    const was = vis;
    vis = es[es.length - 1]!.isIntersecting;
    if (!vis) { tween?.pause(); return; }
    if (was) return;
    if (stale) layout();
    tween?.resume(); // no autoplay: the bench waits for Play
  }, { threshold: 0.25 });
  if (import.meta.env.DEV) (window as unknown as { __benchCells: () => number[][] }).__benchCells = () => plot().map((c) => [c[0], c[1]]);
  io.observe(wrap);
  const offMode = store.subscribe("mode", () => draw());
  const offFonts = store.subscribe("fontGen", () => draw());

  layout();

  const destroy = () => {
    if (dead) return;
    dead = true;
    stop();
    ac.abort();
    ro.disconnect();
    io.disconnect();
    offMode();
    offFonts();
    unreg();
    budget.release(canvas);
  };
  signal.addEventListener("abort", destroy, { once: true });
  return { setAlgo, play, redraw: draw, destroy };
}
