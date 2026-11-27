/** Hero, nav and link facts. Section copy lives in content.ts; nothing outside these two files is personal copy. */
export const SITE = {
  name: "Mohammed Parvez",
  brand: "Raster & Render",
  place: "Dhaka, Bangladesh",
  coords: "23.81N 90.41E",
  study: "B.Sc. CSE, final semester, Daffodil International University",
  lab: "President, AR/VR & Game Development Lab",
  support: "I build graphics software, embedded hardware and AR applications.",
  email: "mohammedmahmudparvez@gmail.com",
};

export const LINKS = [
  { label: "GitHub", href: "https://github.com/Mohammed-051" },
  { label: "LinkedIn", href: "https://www.linkedin.com/in/mahmudparvez051" },
  { label: "ArtStation", href: "https://mahmud_parvez.artstation.com" },
];

export const SECTIONS = [
  { id: "work", n: "01", title: "Work" },
  { id: "about", n: "02", title: "About" },
  { id: "lab", n: "03", title: "Lab" },
  { id: "contact", n: "04", title: "Contact" },
] as const;

/** Work row ids in order, for the router (rr/scroll.ts) without pulling content.ts into the main chunk. content.ts WORK follows this order. */
export const WORK_IDS = ["glitched-server", "climate-controller", "smart-life", "ik-arm", "krishinexus", "campus-network", "banking-database", "mind-atlas", "aegis", "ai-vault", "arvr-lab-website", "hotel-management", "voting-machine", "dns-client-monitor"] as const;

export const UI = {
  mode: { render: "Render", raster: "Raster", name: "Raster view" },
  rail: { name: "Sections", top: "Index" },
  // drag and view: visual only (the cursor node is aria-hidden).
  cursor: { top: "TOP", menu: "MENU", mode: "SWITCH", go: "GO", show: "SHOW", drag: "Drag", view: "View" },
  contact: { copy: "Copy", copied: "Copied", line: "Email, GitHub, LinkedIn or ArtStation." },
  // world/faces.ts draws this chip on a dummy entry, and Lab.tsx shows it on the row.
  dummy: "Placeholder",
  work: {
    index: "Project index",
    // world/faces.ts prints the part before the first full stop on each plate.
    plateNote: "Title plate. Set from the project name, not a project image.",
    prev: "Previous project",
    next: "Next project",
    repo: "Repository",
    fields: { kind: "Kind", role: "Role", year: "Year", status: "Status", stack: "Stack", credit: "Credit" },
  },
  lab: { practice: "Practice", tools: "Tools" },
  sound: { label: "Sound", on: "On", off: "Off" },
  bench: {
    heading: "Rasterization bench",
    side: "Three algorithms from Glitched Server, plotted one cell at a time. Drag a handle, or focus it and use the arrow keys.",
    algos: { bres: "Bresenham", dda: "DDA", circ: "Midpoint circle" },
    algoGroup: "Algorithm",
    play: "Plot step by step",
    legend: { cell: "Plotted cell", line: "Ideal line", circle: "Ideal circle" },
    canvas: "Pixel grid showing the plotted cells",
    handle: { A: "Endpoint A", B: "Endpoint B", C: "Circle centre", R: "Circle radius" },
    readout: {
      line: "Line", delta: "dx, dy", cells: "Cells", err: "Error term", inc: "Increment", exact: "Exact point",
      other: "vs other line", same: "same cells", circle: "Circle", decision: "Decision d", octant: "Octant x, y",
    },
    caption: "Algorithm diagram, illustrative. Not a capture of the application.",
  },
  hero: { local: "Local", hint: { start: "Scroll", fine: "Move the cursor to rasterize", touch: "Tap the name to rasterize" } },
} as const;
