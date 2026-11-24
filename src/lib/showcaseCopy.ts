// Copy for "From a line to pixels" (rr/showcase, components/sections/Showcase.tsx). Kept out of lib/site.ts so the
// main chunk does not carry strings only the lazy Lab section uses. Numbers in the copy are the ones the demos draw.
export const SHOWCASE = {
  title: "From a line to pixels",
  tablist: "Rasterization demo",
  play: "Play", pause: "Pause", replay: "Replay", fig: "Fig.",
  tabs: [
    { id: "portrait", label: "Portrait", head: "The portrait, rasterized",
      blurb: "The picture is sampled to a 56 by 63 grid and cut to four tones. Then it is built from primitives: Bresenham for the outline, midpoint circles for the highlights, filled boxes for the large areas, DDA spans for the rest.",
      cap: "Each cell is drawn once, by the primitive named in the readout." },
    { id: "bresenham", label: "Bresenham", head: "Bresenham line",
      blurb: "Walk the major axis one cell at a time. The sign of p = 2 db - da decides whether the minor axis steps too. Integers only: no division, no rounding.",
      cap: "Two candidate cells per step, one choice, made by the sign of p." },
    { id: "dda", label: "DDA", head: "DDA line",
      blurb: "Take n = max(|dx|, |dy|) steps. Add dx/n and dy/n to two float accumulators and round each to a cell. One division up front, then two additions and two roundings per step.",
      cap: "Dots are the exact accumulator values. The lit cell is where they round to." },
    { id: "circle", label: "Midpoint circle", head: "Midpoint circle",
      blurb: "Plot one octant from (0, r). The decision variable d tests whether the midpoint between east and south-east lies inside the circle. Then mirror every cell into the other seven octants.",
      cap: "One octant is computed. Seven reflections across four axes complete the circle." },
  ],
  alt: {
    portrait: "Portrait being built cell by cell on a coarse grid",
    bres: "Grid with a line and the cells Bresenham lights along it",
    dda: "Grid with a line and the cells a DDA lights along it",
    circle: "Grid with a circle built octant by octant",
  },
  prim: { line: "Bresenham line", circle: "Midpoint circle", box: "Filled box", span: "DDA scanline span" },
  read: {
    line: "Line", major: "da, db", swapped: "x and y swapped", step: "Step", cell: "Cell", choice: "Choice", done: "Done",
    steps: "Steps", inc: "Increment", exact: "Exact", round: "Rounded",
    circle: "Circle", octant: "Octant", mirror: "Mirror", across: "reflect across", offset: "Offset",
    diagonal: "a diagonal", horizontal: "the horizontal", vertical: "the vertical",
    grid: "Grid", tones: "Tones", algo: "Primitive", op: "Primitive no.", cells: "Cells", params: "Parameters",
  },
} as const;
