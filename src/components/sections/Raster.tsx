import { m, type Variants } from "motion/react";
import { A, B, C, CIRCLE, H, LINE, R, W } from "../../fallback/rasterFigure";

/* An explanatory drawing for Glitched Server, computed here from the textbook algorithms the project names.
 * It is a diagram of the method, never a capture of the application, and its caption says so. */

// Self-check: the line is unbroken, one cell per major-axis step, every cell within half a cell of the true
// line; every circle cell within a cell diagonal's half of the true radius.
if (import.meta.env.DEV) {
  const steps = Math.max(Math.abs(B[0] - A[0]), Math.abs(B[1] - A[1]));
  const len = Math.hypot(B[0] - A[0], B[1] - A[1]);
  console.assert(
    LINE.length === steps + 1 &&
      LINE.every(([x, y], i) => {
        const prev = LINE[i - 1];
        const near = Math.abs((B[1] - A[1]) * x - (B[0] - A[0]) * y + B[0] * A[1] - B[1] * A[0]) / len <= Math.SQRT1_2;
        return near && (!prev || Math.max(Math.abs(x - prev[0]), Math.abs(y - prev[1])) === 1);
      }),
    "Raster: Bresenham line is wrong",
  );
  console.assert(
    CIRCLE.length > 0 && CIRCLE.every(([x, y]) => Math.abs(Math.hypot(x - C[0], y - C[1]) - R) <= Math.SQRT1_2),
    "Raster: midpoint circle is wrong",
  );
}

const plot: Variants = {
  hidden: { opacity: 0 },
  shown: (i = 0) => ({ opacity: 1, transition: { duration: 0.2, delay: 0.3 + i * 0.025 } }),
};

export function Raster() {
  return (
    <div className="slot" style={{ aspectRatio: `${W} / ${H}` }}>
      <svg aria-hidden="true" viewBox={`0 0 ${W} ${H}`}>
        {Array.from({ length: W - 1 }, (_, i) => (
          <line key={`x${i}`} x1={i + 1} y1={0} x2={i + 1} y2={H} />
        ))}
        {Array.from({ length: H - 1 }, (_, i) => (
          <line key={`y${i}`} x1={0} y1={i + 1} x2={W} y2={i + 1} />
        ))}
        {[...LINE, ...CIRCLE].map(([x, y], i) => (
          <m.rect key={i} variants={plot} custom={i} x={x + 0.12} y={y + 0.12} width={0.76} height={0.76} className="fill-bone-300" />
        ))}
        {/* The ideal shapes over the cells, so the approximation reads as an approximation. */}
        {/* Inline stroke: `.slot line` would otherwise grey this one out. */}
        <g className="fill-none" style={{ stroke: "var(--color-bone-100)", strokeWidth: 1, vectorEffect: "non-scaling-stroke" }}>
          <line x1={A[0] + 0.5} y1={A[1] + 0.5} x2={B[0] + 0.5} y2={B[1] + 0.5} style={{ stroke: "inherit" }} />
          <circle cx={C[0] + 0.5} cy={C[1] + 0.5} r={R} style={{ vectorEffect: "non-scaling-stroke" }} />
        </g>
      </svg>
      <span className="meta slot__ratio">Bresenham line</span>
      <span className="meta absolute right-2 bottom-1.5 text-bone-500">Midpoint circle, r {R}</span>
    </div>
  );
}
