// Raster footer name: a hand-built pixel face for the letters of the name only. 12 rows, 2-cell stems and bars (every bar exactly
// 2 rows deep, so no letter gets a loose extra foot row), 1-cell tracking.
// Per glyph: letter, width (hex), 12 rows of 3 hex digits; bit (width - 1 - x) is the cell at column x.
// The O is symmetric (two rounded rows top and bottom, six straight rows between) so it never reads as a Q once the foot fades.
const T = "Ma3033873cf37b333303303303303303303303O807e0ff0c30c30c30c30c30c30c30c30ff07eH80c30c30c30c30c30ff0ff0c30c30c30c30c3A807e0ff0c30c30c30ff0ff0c30c30c30c30c3E707f07f06006006007e07e06006006007f07fD80fc0fe0c70c30c30c30c30c30c30c70fe0fcP80fe0ff0c30c30c30ff0fe0c00c00c00c00c0R80fe0ff0c30c30c30ff0fe0cc0c60c60c30c3V80c30c30c30c30c30c30e706606603c03c018Z80ff0ff00300700e01c0380700e00c00ff0ff";
const R = 12, P = 7, GAP = 3; // rows per line, cell pitch in viewBox units (cell 6, gap 1), rows between lines
const G = new Map<string, number[]>();
for (let i = 0; i < T.length; i += 2 + 3 * R) G.set(T[i]!, [parseInt(T[i + 1]!, 16), ...Array.from({ length: R }, (_, r) => parseInt(T.slice(i + 2 + r * 3, i + 5 + r * 3), 16))]);

/** The foot fades by cell row, so the fade follows the letter shapes and no cell is ever removed: the top third of the cap height
 *  (rows 0-3, and row 4 barely) stays solid, rows 4-11 each step down to 0.3. One ink share per band: band 0 is rows 0-3, band n is row n + 3. */
export const FADE = [1, 0.98, 0.92, 0.83, 0.72, 0.6, 0.49, 0.39, 0.3];
const band = (r: number) => Math.max(0, r - 3);

/** Lines of capitals to one cell path per fade band (6 of every 7 units filled) plus a 2x2-cell stop after the last line, on the
 *  baseline rows (10-11), full red and unfaded. ls holds each line as [cap line, baseline, left0, right0, left1, ...] in viewBox
 *  units (the stop counts as a letter), so the host can compose the scene around the letters and the gaps between them. */
export function pixelName(lines: string[]) {
  const d = FADE.map(() => "");
  let w = 0, y = 0, sx = 0;
  const ls: number[][] = [], ch = lines.map((s, i) => s.replace(/ /g, "") + (i === lines.length - 1 ? "." : ""));
  for (const line of lines) {
    let x = 0;
    const l = [y * P, (y + R) * P - 1];
    ls.push(l);
    for (const ch of line) {
      const g = G.get(ch);
      if (!g) { x += 3; continue; } // the word space: 4 columns between words with the tracking
      const gw = g[0]!;
      l.push(x * P, (x + gw) * P - 1);
      for (let r = 0; r < R; r++) for (let c = 0; c < gw; c++) if ((g[r + 1]! >> (gw - 1 - c)) & 1) d[band(r)] += `M${(x + c) * P} ${(y + r) * P}h6v6h-6z`;
      x += gw + 1;
    }
    sx = x;
    w = Math.max(w, x - 1);
    y += R + GAP;
  }
  w = Math.max(w, sx + 2);
  const h = (y - GAP) * P - 1;
  ls[ls.length - 1]?.push(sx * P, sx * P + 13);
  return { d, w: w * P - 1, h, stop: [sx * P, h - 13] as const, ls, ch }; // the stop fills rows 10-11
}

if (import.meta.env.DEV) {
  const n = pixelName(["MOHAMMED PARVEZ"]);
  let cells = 0;
  for (const c of "MOHAMMEDPARVEZ") for (const v of G.get(c)!.slice(1)) cells += v.toString(2).replace(/0/g, "").length;
  console.assert(n.w === 135 * P - 1 && n.h === R * P - 1 && n.ls.length === 1 && n.ls[0]!.length === 2 + 2 * 15, "pixelName: unexpected name size or letter count");
  console.assert(n.d.length === FADE.length && n.d.join("").split("M").length - 1 === cells && n.stop[1] === (R - 2) * P, "pixelName: a cell was dropped, or the stop is off the baseline rows");
  // a glyph with a missing or extra row would shift every later letter's key, so the keys and the total length catch it
  console.assert([...G.keys()].join("") === "MOHAEDPRVZ" && T.length === G.size * (2 + 3 * R), "pixelName: a glyph does not have exactly R rows");
}
