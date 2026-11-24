import { m } from "motion/react";
import { HEAD, LAB, PRACTICE, TOOLS } from "../../lib/content";
import { UI } from "../../lib/site";
import { Bench } from "./Bench";
import { Lede, Rise, SectionHead } from "./parts";
import { fade, useReveal } from "./reveal";

/* Lab: head and lede, practice and tools, the bench figure (L.01), then the other LAB entries as plain rows. */
const RAIL = "meta col-span-full text-bone-500 lg:col-span-2";
const BODY = "col-span-full lg:col-span-10 lg:col-start-3";

export function Lab() {
  const reveal = useReveal();
  return (
    <>
      {/* With the paper world (work.css): a window onto the tray on phones, then the head and text on a paper card,
          sticky from 900 px over the bay that follows it (the sign-off before Contact). */}
      <div className="world-slot col-span-full" aria-hidden="true" data-world-hit="" />
      <div className="wcard col-span-full grid grid-cols-subgrid">
      <SectionHead label="Lab" />

      <div className="col-span-full mt-12 grid grid-cols-subgrid gap-y-6 lg:mt-20">
        <h2 id="lab-title" className="display col-span-full text-display-l">
          <Rise own>Lab</Rise>
        </h2>
        <Lede copy={HEAD.lab} />        <dl className="meta col-span-full grid gap-y-1 text-bone-300 md:grid-cols-[8rem_1fr]">
          <dt className="text-bone-500">{UI.lab.practice}</dt>
          <dd>{PRACTICE.join(", ")}</dd>
          <dt className="text-bone-500">{UI.lab.tools}</dt>
          <dd>{TOOLS.join(", ")}</dd>
        </dl>
      </div>

      <Bench />

      <m.ol className="lb col-span-full mt-16 grid grid-cols-subgrid lg:mt-24" {...reveal}>
        {LAB.filter((x) => x.load !== "bench").map((x, i) => (
          <m.li key={x.id} variants={fade} custom={i} className="lb__entry relative col-span-full grid grid-cols-subgrid gap-y-2 py-6">
            <span data-rr-rule aria-hidden="true" className="absolute inset-x-0 top-0 h-px origin-left bg-ink-800" />
            <p className={`lb__date ${RAIL}`}>
              {x.n}
              {x.date && <span className="block">{x.date}</span>}
            </p>
            <div className={`lb__meta ${BODY} space-y-2`}>
              <h3 className="heading text-heading text-bone-100">{x.title}</h3>
              {x.dummy && <p className="meta text-bone-500"><span className="lb__chip">{UI.dummy}</span></p>}
              {(x.line ?? x.alt) && <p className="max-w-[60ch] text-bone-300">{x.line ?? x.alt}</p>}
            </div>
          </m.li>
        ))}
      </m.ol>
      </div>
      <div className="wbay" aria-hidden="true" />
    </>
  );
}
