/* The no-JavaScript page, generated at build time from content.ts and site.ts.
 * Pure string functions: no React, no DOM, no clock, no randomness, so two builds give identical bytes.
 * Relative imports with extensions only: vite.config.ts imports this file before any alias exists. */
import { HEAD, LAB, PRACTICE, SHEETS, TOOLS, WORK } from "../lib/content.ts";
import { LINKS, SITE, UI } from "../lib/site.ts";
import { A, B, C, CIRCLE, H, LINE, R, W } from "./rasterFigure.ts";

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ESC[c] ?? c);

const e = escapeHtml;
const link = (href: string, text: string, rel?: string) => `<a href="${e(href)}"${rel ? ` rel="${e(rel)}"` : ""}>${e(text)}</a>`;
const li = (items: readonly string[]) => items.map((s) => `<li>${s}</li>`).join("");
/* parts.tsx Lede: the section's supporting title and short description. */
const lede = (c: readonly [string, string]) => `<p><strong>${e(c[0])}</strong></p><p>${e(c[1])}</p>`;
/* Work.tsx Sep: the row's parts read as one phrase to a screen reader. */
const SEP = `<span class="sr-only">, </span>`;

/** The Bench figure: the same cells Raster.tsx draws, as static rects, with the ideal shapes over them. */
function figure() {
  const cells = [...LINE, ...CIRCLE].map(([x, y]) => `<rect x="${x + 0.12}" y="${y + 0.12}" width="0.76" height="0.76"/>`).join("");
  return (
    `<figure><svg viewBox="0 0 ${W} ${H}" aria-hidden="true"><g fill="currentColor">${cells}</g>` +
    `<g fill="none" stroke="currentColor" stroke-width="0.08"><line x1="${A[0] + 0.5}" y1="${A[1] + 0.5}" x2="${B[0] + 0.5}" y2="${B[1] + 0.5}"/>` +
    `<circle cx="${C[0] + 0.5}" cy="${C[1] + 0.5}" r="${R}"/></g></svg>` +
    `<figcaption>Bresenham line. Midpoint circle, r ${R}. ${e(UI.bench.caption)}</figcaption></figure>`
  );
}

function hero() {
  return (
    `<h1>${e(SITE.name)}</h1><p>Creator &amp; Developer</p>` +
    `<p>${e(SITE.support)}</p><ul>${li([SITE.place, SITE.study, SITE.lab].map(e))}</ul>`
  );
}

/** Work: Work.tsx's stack layout, every detail open (no JS, no ring). Article ids are plate-<id> so deep links match.
 *  A title plate needs JS, so none is drawn here. */
function work() {
  const F = UI.work.fields;
  const items = WORK.map((w) => {
    const id = `plate-${w.id}`;
    const facts = (
      [[F.kind, w.kind], [F.role, w.role], [F.year, w.year], [F.status, w.status], [F.stack, w.stack.join(", ")], [F.credit, w.credit]] as const
    )
      .filter(([, v]) => v)
      .map(([k, v]) => `<div><dt>${e(k)}</dt><dd>${e(v!)}</dd></div>`)
      .join("");
    const title = w.pre ? `${w.pre} ${w.title}` : w.title;
    return (
      `<li class="wk__item"><article id="${id}" aria-labelledby="${id}-title">` +
      `<h3 id="${id}-title" class="wk__row"><span class="wk__n">${e(w.n)}</span>${SEP}<span class="wk__title">${e(title)}</span>${SEP}` +
      `<span class="wk__kind">${e(w.kind)}</span></h3><div id="${id}-detail" class="wk__detail">` +
      `<p class="wk__line">${e(w.line)}</p><dl class="wk__facts">${facts}</dl>` +
      (w.repo ? `<p class="wk__repo">${link(w.repo, `${UI.work.repo}: ${w.repo.replace("https://", "")}`, "noopener")}</p>` : "") +
      `</div></article></li>`
    );
  }).join("");
  return `<h2 id="work">Work</h2>${lede(HEAD.work)}<ol class="wk" aria-label="${e(UI.work.index)}">${items}</ol>`;
}

/** Lab: practice and tools, the bench figure (L.01), then the other entries as rows. */
function lab() {
  const rows = LAB.filter((x) => x.load !== "bench").map(
    (x) =>
      `<li class="lb__entry"><p class="lb__date">${e(x.n)}${x.date ? ` ${e(x.date)}` : ""}</p>` +
      `<h4>${e(x.title)}${x.dummy ? ` (${e(UI.dummy)})` : ""}</h4>${x.line ?? x.alt ? `<p>${e((x.line ?? x.alt)!)}</p>` : ""}</li>`,
  ).join("");
  return (
    `<h2 id="lab">Lab</h2>${lede(HEAD.lab)}<dl><dt>${e(UI.lab.practice)}</dt><dd>${e(PRACTICE.join(", "))}</dd>` +
    `<dt>${e(UI.lab.tools)}</dt><dd>${e(TOOLS.join(", "))}</dd></dl>` +
    `<h3>${e(UI.bench.heading)}</h3><p>${e(UI.bench.side)}</p>${figure()}<ol class="lb">${rows}</ol>`
  );
}

/** About: the six sheets of About.tsx, with the handwritten line as plain text. */
function about() {
  const sheets = SHEETS.map((x) => `<li><h3>${e(x.h)}</h3><p>${e(x.cap)}</p><p>${e(x.hand.join(". "))}</p></li>`).join("");
  return `<h2 id="about">About</h2>${lede(HEAD.about)}<ol>${sheets}</ol>`;
}

/** Contact: the heading, the line, then the four channels by name. */
function contact() {
  const links = [link(`mailto:${SITE.email}`, "Email"), ...LINKS.map((l) => link(l.href, l.label, "me noopener"))];
  return `<h2 id="contact">Contact</h2><p>${e(UI.contact.line)}</p><ul>${li(links)}</ul>`;
}

/** Inner markup of #root before React mounts: every section that has a no-JS version, in page order. */
export function renderFallback() {
  return `<main class="fallback">${hero()}${work()}${about()}${lab()}${contact()}</main>`;
}
