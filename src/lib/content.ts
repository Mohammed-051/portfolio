/* Section copy. Every fact is sourced; nothing here is inferred.
 * Never add: phone, street address, CGPA or school GPAs, client work without permission. */
import { UI, type WORK_IDS } from "./site.ts";

/* Public repos only, each checked to return 200. Private repos never appear on the site. */
const GH = "https://github.com/Mohammed-051/";
const REPO = {
  glitched: `${GH}glitched-server`,
  smartLife: `${GH}smart-life-inclusion`,
  campus: `${GH}Campus-Area-Network`,
};

/** Each section's supporting title and short description, under its heading. */
export const HEAD = {
  work: ["Selected work", "Six projects across graphics, embedded hardware, AR, robotics, web and networks."],
  about: [
    "Study, lab and contests",
    "I am a final-semester Computer Science and Engineering student at Daffodil International University and President of its AR/VR & Game Development Lab. I write C and C++, build embedded systems on Arduino, ESP32 and STM32, and make AR and VR work in Unity and Blender.",
  ],
  lab: ["Creative practice beside the development", "3D, low-poly scenes, digital art and video. One live experiment, the rasterization bench."],
} as const;

/* Lab: creative practice. */
export const PRACTICE = ["3D animation", "Low-poly scenes", "Game development", "Digital art", "Video editing"];
export const TOOLS = ["Blender", "Photoshop", "Lightroom", "Illustrator", "InDesign", "Premiere Pro", "Audition", "Canva"];
const CREDIT = { when: "Oct 2023", role: "Video Editor", where: "Team ShadowAstra, NASA Space Apps Challenge", note: "Managed and edited video content for the team's project submission." };

/* Work: the six projects as one list. Unknown fields are left out and render
 * nothing. Counters use WORK.length. Climate Controller: no patent, schematic, layout, pinout, firmware logic
 * or circuit values, by rule. SMART-LIFE: no children, learner data or results, by rule. */
export type WorkId = (typeof WORK_IDS)[number];
export type WorkLink = { label: string; href: string };
/** Interface strings of the project board (components/sections/ProjectBoard.tsx), not section copy. */
export const BOARD = {
  back: "Back", dialog: "Project board", overview: "Overview", build: "Challenge & Build", highlights: "Highlights",
  stack: "Stack", people: "Role / Credits", links: "Repository / Live", role: "Role", credit: "Credit",
  none: "Details to come.", noLinks: "No public link yet.", repo: "Repository",
};
/** Where a board image lives: public/images/projects/<slug>/hero.png and 01.png to 03.png. A missing file shows a labelled
 *  paper placeholder (ProjectBoard.tsx), so adding the real files later needs no code edit, only a rebuild (dev restart). */
// vite.config.ts also imports this file under the node tsconfig, where import.meta.env is untyped and absent.
const BASE = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? "/";
export const GALLERY_SLOTS = ["01", "02", "03"] as const;
const shots = (slug: string) => ({
  hero: `${BASE}images/projects/${slug}/hero.png`,
  gallery: GALLERY_SLOTS.map((n) => `${BASE}images/projects/${slug}/${n}.png`),
});
export type WorkItem = {
  n: string; id: WorkId; title: string; pre?: string; line: string; kind: string;
  role?: string; year?: string; status?: string; stack: string[]; credit?: string;
  repo?: string;  // a checked public URL only
  links: WorkLink[]; // other checked public URLs (a live site, a write-up); empty until one exists
  overview?: string;   // board: absent renders a marked placeholder line (BOARD.none)
  build?: string;      // board: Challenge & Build
  highlights: string[]; // board: empty renders a marked placeholder line
  images: { hero: string; gallery: string[] }; // board: hero 16:9, gallery 4:3, from the slug
  plate?: WorkId; // a generated plate exists (one of rr/store.ts ProjectId; not imported, store.ts needs the DOM and vite.config.ts loads this file)
  dummy?: true;
};
/* Board copy is factual only. Where the facts run out the field is left out
 * and the board prints BOARD.none. Never add: a patent, a phone, a street address, grades, private repos. */
export const WORK: WorkItem[] = [
  {
    n: "W.01", id: "glitched-server", title: "Glitched Server", kind: "Graphics application", status: "Completed",
    role: "Lead developer", credit: "With Tahmidul Islam Mugdha and Rahul Roy Rik",
    line: "A 3D C++ FreeGLUT computer graphics application with custom Bresenham line, DDA and Midpoint circle rasterization algorithms.",
    overview: "A FreeGLUT C++ game artifact built as a systems-focused graphics project. It fuses low-level raster algorithms, real-time OpenGL rendering and custom AI navigation in one executable loop.",
    build: "Pixels are drawn without high-level shape helpers, using custom Bresenham line, Midpoint circle and DDA routines. The 3D side renders in real time through FreeGLUT and OpenGL in one update-render cycle, with C++ control over transforms, scene composition and frame behaviour. Hand-built pathfinding steers autonomous movement under map and gameplay constraints, inside the main game loop. Built with Code::Blocks and MinGW.",
    highlights: [
      "Custom 2D rasterization: Bresenham line, Midpoint circle and DDA",
      "Real-time 3D OpenGL pipeline through FreeGLUT",
      "Custom AI pathfinding integrated in the main game loop",
    ],
    stack: ["C++", "FreeGLUT", "OpenGL", "Bresenham", "DDA", "Midpoint circle"], repo: REPO.glitched, plate: "glitched-server", links: [], images: shots("glitched-server"),
  },
  {
    n: "W.02", id: "climate-controller", pre: "Automated Inventory", title: "Climate Controller", kind: "Embedded hardware",
    status: "Advanced prototype", credit: "Solo project",
    line: "A 2-layer PCB and firmware for an ESP32-based controller using a DHT22 sensor and SSD1306 OLED.",
    overview: "A custom 2-layer PCB and bare-metal ESP32 firmware for industrial environmental automation.",
    build: "Sensing uses a DHT22 sensor, with readout on an SSD1306 OLED display.",
    highlights: ["Custom 2-layer PCB", "Bare-metal ESP32 firmware", "DHT22 sensing with an SSD1306 OLED display"],
    stack: ["ESP32", "2-layer PCB", "Firmware", "DHT22", "SSD1306 OLED"], plate: "climate-controller", links: [], images: shots("climate-controller"),
  },
  {
    n: "W.03", id: "smart-life", title: "SMART-LIFE INCLUSION", kind: "Final-year academic project", role: "Unity, AR, Firebase, voice",
    status: "In development", credit: "With Tahmidul Islam Mugdha (UI/UX, 3D, web)",
    line: "A marker-based AR Unity tablet application and a web supervisor dashboard.",
    overview: "An AI-AR ecosystem for special education, vocational training and assisted daily living (ADL). It is the final-year design project.",
    build: "The \"Magic Lens\" Android tablet app runs marker-based AR on Unity 6 (6000.6.8f1), URP and Vuforia Engine 11.4.4. The supervisor dashboard is built with React, Vite, TypeScript and Firebase, on a Firebase Realtime Database with rules and seed data. Blender is used for the 3D avatars and props.",
    highlights: [
      "\"Magic Lens\" Android tablet app: Unity 6, URP, Vuforia Engine 11.4.4",
      "Supervisor dashboard: React, Vite, TypeScript, Firebase",
      "Firebase Realtime Database with rules and seed data",
      "Blender 3D avatars and props",
      "Docs for the PRD, design system, architecture, database, security, style and testing",
    ],
    stack: ["Unity", "Vuforia", "Android tablet", "React", "Firebase"], repo: REPO.smartLife, plate: "smart-life", links: [], images: shots("smart-life"),
  },
  {
    n: "W.04", id: "ik-arm", title: "2D Inverse Kinematics Sorting Robotic Arm", kind: "Robotics prototype", status: "Prototype",
    line: "A Tinkercad prototype with Arduino control and finite state machine logic.",
    overview: "A Tinkercad prototype with Arduino control and finite state machine logic, using 2D inverse kinematics for sorting.",
    highlights: [],
    stack: ["Tinkercad", "Arduino", "Finite state machine", "Inverse kinematics"], links: [], images: shots("ik-arm"),
  },
  {
    n: "W.05", id: "agrisphere", title: "AgriSphere AI Suite", kind: "Web application", status: "In development",
    line: "An integrated 4-domain web application: AgriSphere, FoodSphere, ClimateSphere and HealthSphere AI.",
    overview: "An integrated 4-domain web application: AgriSphere, FoodSphere, ClimateSphere and HealthSphere AI.",
    highlights: [],
    stack: ["AgriSphere", "FoodSphere", "ClimateSphere", "HealthSphere AI"], links: [], images: shots("agrisphere"),
  },
  {
    n: "W.06", id: "campus-network", title: "Campus Area Network", kind: "Network design",
    line: "A Cisco Packet Tracer network design integrating OSPF, IPSec VPN, HSRP, EtherChannel, VLANs and ASA Firewalls.",
    overview: "A Cisco Packet Tracer design connecting a headquarters site and a branch office over secure WAN links, plus a DMZ for public servers.",
    build: "Routing and switching use OSPF area 0, HSRP gateway redundancy, EtherChannel (LACP), department VLANs and inter-VLAN routing on multilayer switches. Security uses Cisco ASA firewalls, an IPSec site-to-site VPN between headquarters and branch, ACLs, NAT/PAT and the DMZ. Each site has dual firewalls and dual multilayer switches for high availability.",
    highlights: [
      "OSPF area 0, HSRP, EtherChannel (LACP) and department VLANs",
      "Cisco ASA firewalls, IPSec site-to-site VPN, ACLs, NAT/PAT and a DMZ",
      "Dual firewalls and dual multilayer switches per site",
    ],
    stack: ["Cisco Packet Tracer", "OSPF", "IPSec VPN", "HSRP", "EtherChannel", "VLANs", "ASA Firewalls"], repo: REPO.campus, links: [], images: shots("campus-network"),
  },
];

/* Lab, ordered by n: the live bench, the log, then placeholder experiments. This one array feeds the Lab rows
 * (Lab.tsx), the no-JS page and the 3D tray (world/lab.ts: one paper card per entry, the tray sizes itself to the count).
 * Fields: n = the L.xx number (keep them in order); id = unique slug; kind = the small caps label on the card ("live" for
 * the bench, "figure" for a visual piece, "log" for a note); title = the card heading (short, two lines at most);
 * line = one honest sentence under the row title; date = optional, shown under the number; load "bench" renders the
 * live bench; dummy: true marks a placeholder and shows the "Placeholder" chip on the row and the card.
 * To swap one in: replace its title and line with the real work and delete `dummy: true`. To add or drop an entry, edit
 * the array; nothing else changes. */
export type LabEntry = {
  n: string; id: string; kind: "live" | "figure" | "log"; title: string; line?: string;
  date?: string; load?: "bench" | "dither" | "plot"; ratio?: string; alt?: string; dummy?: true;
};
export const LAB: LabEntry[] = [
  { n: "L.01", id: "bench", kind: "live", title: UI.bench.heading, line: UI.bench.side, load: "bench" },
  { n: "L.02", id: "space-apps", kind: "log", title: `${CREDIT.role}, ${CREDIT.where}`, line: CREDIT.note, date: CREDIT.when },
  { n: "L.03", id: "sdf-march", kind: "figure", dummy: true, title: "Raymarched SDF scene study",
    line: "A fragment-shader sketch: signed distance fields, soft shadows and a fixed camera. Not built yet." },
  { n: "L.04", id: "esp32-node", kind: "log", dummy: true, title: "ESP32 sensor node on the bench",
    line: "An embedded note: a microcontroller, one sensor and a serial log. Wiring and code to come." },
  { n: "L.05", id: "ar-overlay", kind: "figure", dummy: true, title: "Marker-based AR overlay test",
    line: "An AR experiment: a printed marker, a tracked pose and a small 3D object on top. Not built yet." },
  { n: "L.06", id: "plotter-flow", kind: "figure", dummy: true, title: "Pen plotter flow-field sketches",
    line: "Generative line work prepared as vector paths for a pen plotter. No plots made yet." },
  { n: "L.07", id: "gltf-export", kind: "log", dummy: true, title: "Blender to glTF export script",
    line: "A tooling note: a script that checks names, bevels and texture sizes before an export. Not written yet." },
  { n: "L.08", id: "particle-field", kind: "figure", dummy: true, title: "Instanced particle field in WebGL",
    line: "A graphics study: many instanced points moved on the GPU, with a frame-time readout. Not built yet." },
];

/* About: six sheets, each one image, one heading, one caption, at most two lines in the hand.
 * img: the approved portrait, or an ink drawing (captioned as a drawing in About.tsx). */
export type Sheet = { h: string; cap: string; hand: string[]; img: "portrait" | "headset" | "planet" | "medal" | "grid" | "tablet" };
export const SHEETS: Sheet[] = [
  { h: "Mohammed Parvez", cap: "Creator & Developer. Final-semester Computer Science and Engineering student at Daffodil International University.", hand: ["Dhaka, Bangladesh"], img: "portrait" },
  { h: "AR/VR & Game Development Lab", cap: "President. I run the lab's projects, people and equipment.", hand: ["since Sep 2023"], img: "headset" },
  { h: "Mars Visual Experience", cap: "A VR prototype, exhibited at the Bangladesh Innovation Fair.", hand: ["VR"], img: "planet" },
  { h: "Champion Team, IC-04", cap: "University Innovation Hub Program.", hand: ["UIHP"], img: "medal" },
  { h: "Contests", cap: "22nd in the TAKE-OFF finals. About 300 problems solved on Beecrowd.", hand: ["ICPC, CTF, UTA"], img: "grid" },
  { h: "Now", cap: "Building SMART-LIFE INCLUSION, version 1.", hand: ["in progress"], img: "tablet" },
];
