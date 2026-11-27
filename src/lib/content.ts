/* Section copy. Every fact is sourced; nothing here is inferred.
 * Never add: phone, street address, CGPA or school GPAs, client work without permission. */
import { UI, type WORK_IDS } from "./site.ts";

/* Public repos only, each checked to return 200. Private repos never appear on the site. */
const GH = "https://github.com/Mohammed-051/";
const REPO = {
  glitched: `${GH}glitched-server`,
  smartLife: `${GH}smart-life-inclusion`,
  campus: `${GH}Campus-Area-Network`,
  banking: `${GH}banking-database-project`,
  krishinexus: "https://github.com/HTanvir0011/KrishiNexus", // the team lead's public repo
  mindAtlas: `${GH}mind-atlas`,
  aegis: `${GH}aegis`,
  aiVault: `${GH}ai-vault`,
  hotel: `${GH}hotel-management-system`,
  evm: `${GH}electronic-voting-machine`,
  dnsMonitor: `${GH}dns-client-monitor`,
  shadowAstra: "https://github.com/ABRUBAB/ShadowAstra_Atlas", // the team lead's public repo
};

/** Each section's supporting title and short description, under its heading. */
export const HEAD = {
  work: ["Selected work", "Sixteen projects across graphics, embedded hardware, AR, robotics, AI, databases, networks and the web."],
  about: [
    "Study, lab and contests",
    "I am a final-semester Computer Science and Engineering student at Daffodil International University and President of its AR/VR & Game Development Lab. I write C and C++, build embedded systems on Arduino, ESP32 and STM32, and make AR and VR work in Unity and Blender.",
  ],
  lab: ["Creative practice beside the development", "3D, low-poly scenes, digital art and video. One live experiment, the rasterization bench."],
} as const;

/* Lab: creative practice. */
export const PRACTICE = ["3D animation", "Low-poly scenes", "Game development", "Digital art", "Video editing"];
export const TOOLS = ["Blender", "Photoshop", "Lightroom", "Illustrator", "InDesign", "Premiere Pro", "Audition", "Canva"];
const CREDIT = { when: "Oct 2026", role: "Video Editor", where: "Team ShadowAstra, NASA Space Apps Challenge", note: "Managed and edited video content for the team's project submission." };

/* Work: the projects as one list. Unknown fields are left out and render
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
    n: "W.01", id: "glitched-server", title: "Glitched Server", kind: "Graphics application", year: "2026", status: "Completed",
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
    n: "W.03", id: "smart-life", title: "SMART-LIFE INCLUSION", kind: "Final-year academic project", year: "2026",
    role: "Lead developer (Unity, AR, Firebase, voice)", status: "In development", credit: "With Tahmidul Islam Mugdha (UI/UX, 3D, web)",
    line: "A marker-based AR Unity tablet application and a web supervisor dashboard.",
    overview: "An AI-AR ecosystem for special education, vocational training and assisted daily living (ADL). It is the final-year design project.",
    build: "The \"Magic Lens\" Android tablet app runs marker-based AR on Unity 6 (6000.6.8f1), URP and Vuforia Engine 11.4.4. The supervisor dashboard is built with React, Vite, TypeScript and Firebase, on a Firebase Realtime Database with rules and seed data. Version 1 runs a Morning Routine: a boot scene stays loaded while one scene per step loads in turn, 16 step scenes from waking up to getting dressed. Ten printed marker cards are generated by a Python script, and the app builds its Vuforia image targets from them at start, so there is no target database to download. The first Android build, v0.0.1, comes from a batch build. Blender avatars and props are planned.",
    highlights: [
      "\"Magic Lens\" Android tablet app: Unity 6, URP, Vuforia Engine 11.4.4",
      "Morning Routine V1: a boot scene and 16 step scenes",
      "10 generated marker cards, built into Vuforia image targets at start",
      "First Android build, v0.0.1",
      "Supervisor dashboard: React, Vite, TypeScript, Firebase",
      "Firebase Realtime Database with rules and seed data",
      "Blender 3D avatars and props (planned)",
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
  /* KrishiNexus (formerly AgriSphere AI Suite; "AgriSphere AI" is the congress track). Sources: tanvir.health, the
   * public repo (his commit fa08f69, the Krishi Wallet redesign of mobile/) and the owner (finalist, role).
   * The agents, RAG and MCP tools are the team's work: describe them as the product, never as his.
   * The site's pitch figures stay off, and its Sentinel-1 radar is simulated, so no "live flood alerts" claim.
   * Update status after the final showcase on 26 Dec 2026. */
  {
    n: "W.05", id: "krishinexus", title: "KrishiNexus OS", kind: "AI platform, web and Android", year: "2026",
    status: "Hackathon finalist", role: "Full-stack developer", credit: "Team Heat Wave, led by Tanvir Hossin",
    line: "A multi-agent AI platform that helps Bangladeshi farmers sell at a fair price, find cold storage and plan the harvest around flash floods.",
    overview: "A farmer asks a question by voice in their own dialect, and four AI agents answer it: they grade the crop, route it to buyers on a shared truck past the middlemen, find open cold-storage space and weigh the flash-flood risk before harvest. Team Heat Wave built it for the International AI Builders Congress 2026 by CloudCamp Bangladesh, in the AgriSphere AI, FarmMarket track, and the team is through to the final round. The final showcase is on 26 December 2026 at Daffodil International University.",
    build: "I am the team's full-stack developer. I build the screens farmers, buyers and drivers use, on the web in React and TypeScript, and in the Flutter Android app. I redesigned that app as \"Krishi Wallet\", a fintech-style app that puts farmers first. Every money screen leads with the amount. Bids, sales and listings ask for confirmation first and show a receipt after. The type is larger, the main buttons are 56 dp, and every status shows an icon, a colour and a word. Behind those screens, every question runs through a nine-node LangGraph pipeline on a FastAPI backend, with CRAG and GraphRAG retrieval, and the agents call 13 tools over MCP. The Android app uses the same account as the web: questions by voice in Bangla, crop grading with the phone's camera, then selling, delivery and payment.",
    highlights: [
      "Finalist, International AI Builders Congress 2026 (CloudCamp Bangladesh)",
      "Screens for farmers, buyers and drivers, on the web and Android",
      "Redesigned the Flutter Android app as \"Krishi Wallet\"",
      "Voice questions in Bangla, including regional dialects",
      "Nine-node LangGraph agent pipeline with CRAG and GraphRAG retrieval",
      "13 MCP tools for prices, cold storage, weather and flood risk",
    ],
    stack: ["React", "TypeScript", "Flutter", "FastAPI", "LangGraph", "MCP"], repo: REPO.krishinexus,
    links: [{ label: "Live site", href: "https://tanvir.health/" }], images: shots("krishinexus"),
  },
  /* Campus Area Network. Source: the public repo (one commit, 4 Feb 2026), configs/ checked; draft confirmed by the owner.
   * The repo's .docx report is not a source: it names RIP, port security and a remote-access VPN the configs do not back.
   * One ASA per site (owner confirmed). A solo course project; the course stays off by the owner's choice. */
  {
    n: "W.06", id: "campus-network", title: "Campus Area Network", kind: "Network design course project", year: "2026",
    status: "Completed", role: "Network designer", credit: "Solo project",
    line: "A Cisco Packet Tracer network design integrating OSPF, IPSec VPN, HSRP, EtherChannel, VLANs and ASA Firewalls.",
    overview: "A Cisco Packet Tracer design connecting a headquarters site and a branch office over secure WAN links, plus a DMZ for public servers.",
    build: "Routing and switching use OSPF area 0, HSRP gateway redundancy, EtherChannel (LACP) between each site's two multilayer switches, and inter-VLAN routing on those switches. Headquarters has Management, LAN and WLAN VLANs, the branch has its own LAN and WLAN VLANs, and unused access ports sit shut down in a blackhole VLAN. Each department has its own access switch. Security uses Cisco ASA firewalls, an IPSec site-to-site VPN between headquarters and branch, ACLs, NAT/PAT and the DMZ. Each site has one ASA, linked to both of its multilayer switches.",
    highlights: [
      "OSPF area 0, HSRP, EtherChannel (LACP) and LAN, WLAN and management VLANs",
      "Cisco ASA firewalls, IPSec site-to-site VPN, ACLs, NAT/PAT and a DMZ",
      "One ASA per site, linked to both of the site's multilayer switches",
    ],
    stack: ["Cisco Packet Tracer", "OSPF", "IPSec VPN", "HSRP", "EtherChannel", "VLANs", "ASA Firewalls"], repo: REPO.campus, links: [], images: shots("campus-network"),
  },
  /* Banking Database. Source: the public repo (sql/, src/, data/), every claim checked in code; draft confirmed by the
   * owner. The repo's .docx report is not a source: it names MySQL, a Transaction table and timings the code does not
   * back. A course project; the course and university stay off by the owner's choice. Seed data is Faker-generated. */
  {
    n: "W.07", id: "banking-database", title: "Banking Database", kind: "Database course project", year: "2025",
    status: "Completed", credit: "Solo project",
    line: "An Oracle banking database with an audit trigger on balance changes and a Python command-line client.",
    overview: "A relational Oracle database for a bank's core records: banks and branches, customers, accounts, credit cards, loans, loan payments and staff. A Python terminal menu works on the customer records, and a seeded generator writes fake test data for it as CSV.",
    build: "The schema has 13 tables. Saving and Current extend Account as subtype tables keyed on the account number, phone numbers sit in their own table so a customer can have several, and Account_Management links employees to the accounts they manage. Foreign keys run from bank to branch to customer, and on to accounts, cards, loans and payments, with seven indexes on the common lookups. An AFTER UPDATE trigger writes every balance change, old and new balance, time and database user, to an audit table numbered by a sequence. The Python CLI uses cx_Oracle with bind variables to add, update, delete and look up customers, join them to their accounts and filter by city, name prefix, birth date, state or zip code. Updates are limited to an allow-list of columns. A Faker script seeded for repeatable output writes 5 banks, 10 branches, 200 customers, 400 accounts, 50 employees, 50 loans, 200 payments and 100 credit cards to CSV.",
    highlights: [
      "13-table Oracle schema with Saving and Current account subtypes",
      "AFTER UPDATE trigger logs every balance change to an audit table",
      "Python CLI on cx_Oracle with bind variables and an update allow-list",
      "Customer filters by city, name prefix, birth date, state or zip",
      "Seeded Faker generator for repeatable, fake test data",
    ],
    stack: ["Oracle Database", "SQL", "PL/SQL", "Python", "cx_Oracle", "Faker"], repo: REPO.banking, links: [], images: shots("banking-database"),
  },
  /* Mind Atlas (the app is named MindMentor in its code; the owner chose the repo name). Source: the public repo, commits
   * of 8 May 2026, every claim checked in code. Left off by rule: the auto-generated "47 tests" report (CI does not gate
   * on tests) and mindmentor.app (only a request header, not a site). No deployment or store release yet. */
  {
    n: "W.08", id: "mind-atlas", title: "Mind Atlas", kind: "AI well-being app, Android and iOS", year: "2026",
    status: "MVP", role: "Solo developer", credit: "Solo project",
    line: "A Flutter mental well-being app with an AI chat companion, daily mood tracking and a crisis check that routes to the 988 Lifeline.",
    overview: "A mental well-being companion for Android and iOS. Users log their mood each day on a five-point scale with an optional note, talk with an AI companion, and see their moods and trends on a monthly calendar. If a message mentions self-harm, the app locks the chat and opens the 988 Suicide & Crisis Lifeline screen instead of sending it.",
    build: "The app is built in Flutter, with Riverpod for state and GoRouter for navigation; its route guards follow the Supabase sign-in state. Chat messages go to a Supabase Edge Function written in Deno. It checks the user's token, adds a system prompt that rules out diagnoses and medication advice, calls Claude 3 Haiku through OpenRouter and saves both messages in PostgreSQL. The API key stays on the server, and row-level security limits every table to its owner. The crisis check runs on the phone, before any request is sent. Unit and widget tests with mocktail cover the data models, the keyword check and the redirect to the emergency screen, and a GitHub Actions workflow analyzes the code and builds the Android APK and the iOS app.",
    highlights: [
      "On-device crisis keyword check that locks the chat and opens the 988 Lifeline screen",
      "Deno Edge Function relays chat to Claude 3 Haiku through OpenRouter; the API key never reaches the app",
      "Supabase Auth and PostgreSQL, with row-level security on every table",
      "Daily mood log and a monthly insights calendar",
      "Unit and widget tests, and CI builds for Android and iOS",
    ],
    stack: ["Flutter", "Dart", "Riverpod", "Supabase", "Deno", "OpenRouter"], repo: REPO.mindAtlas, links: [], images: shots("mind-atlas"),
  },
  /* Aegis. Source: the public repo (MIT, v0.3.1, commits 11 to 20 Nov 2026), README and hooks/ checked; draft confirmed
   * by the owner. A model router for Claude Code, not security software. */
  {
    n: "W.09", id: "aegis", title: "Aegis", kind: "Claude Code plugin", year: "2026",
    status: "Released, v0.3.1", role: "Author", credit: "Solo project",
    line: "A Claude Code plugin that picks the model and effort for every prompt, with hard limits enforced in code and a live pane.",
    overview: "Aegis is a model dispatcher for Claude Code, in the terminal and in the Claude desktop app. Each prompt first goes to a router model, Opus 5.5 by default or Fable 5.2 if chosen. The router reads the request, the last few messages and the current model, then picks the model for the turn (Haiku, Sonnet, Opus or Fable) and how hard it thinks.",
    build: "The router answers in one line of JSON, and the plugin reads that answer even when extra text or code fences surround it. Every route then passes through rules written in code, not left to the router: a per-model effort cap (Fable at most medium), a nudge to stay on the current model so its prompt cache stays warm, and short follow-ups like \"yes\" or \"continue\" that keep the last route with no router call. If a Fable router call fails, Aegis retries once on Opus and pauses Fable for ten minutes. If routing still fails, the turn runs on Sonnet, with effort set by the prompt's length and code blocks. A pane shows the router's decision, the active model and effort, and the router's token use and response time.",
    highlights: [
      "Picks the model and effort for each prompt: Haiku, Sonnet, Opus or Fable 5.2",
      "Effort caps and fallbacks enforced in code, not by the router",
      "Follow-ups keep the last route without a router call",
      "If Fable fails: retry on Opus, Fable paused for 10 minutes",
      "Live pane, plus /aegis commands for status, on/off and picking the router",
    ],
    stack: ["TypeScript", "TSX", "Claude Code plugin hooks"], repo: REPO.aegis, links: [], images: shots("aegis"),
  },
  /* AIVault. Source: the public repo (MIT, v1.3.1, commits 4 to 5 Nov 2026); the counts (36 rules, 13 permission kinds,
   * 19 domains, 6 phases, 5 clients, no approve tool over MCP) checked in engine/. Left off: third-party attack stats,
   * README performance and calibration figures, test and star counts. Draft confirmed by the owner. */
  {
    n: "W.10", id: "ai-vault", title: "AIVault", kind: "Developer tool, CLI and MCP server", year: "2026",
    status: "Open source, v1.3.1", role: "Author", credit: "Solo project",
    line: "A lockfile and permission labels for AI agent skills: it pins what you approved and holds any update that gives a skill new powers.",
    overview: "Agent skills are instruction files that coding agents such as Claude Code follow with the user's own permissions, and most are installed from a git repo and never read again. AIVault puts them under a lockfile. It pins every skill and subagent to the commit and file hashes you approved, labels what each one can do, and holds an update that adds network access, secrets or git push until you have seen the diff. It also routes the agent to the few skills a task needs, through one MCP server.",
    build: "AIVault is a Node.js command-line tool and MCP server with no dependencies; the MCP stdio transport is written by hand, without an SDK. Every new source is cloned into quarantine and checked against 36 static rules for remote code execution, credential theft, exfiltration and prompt injection before it reaches the library. vault.lock records the approved commit, a SHA-256 hash of every skill file and each skill's permissions, inferred from its instructions and scripts across 13 kinds, from network hosts and secrets to publishing and writing outside the project. vault update diffs each new version against the lock: updates with no new permissions apply, the rest are held. vault_read refuses any file changed since approval and opens each skill with a card listing what it was approved to do. The MCP server has review tools but no approve tool, so only the user can approve, at a terminal. For routing, skills are sorted into 19 domains and searched with BM25; vault_plan splits a task into six phases, from discover to ship, and names a skill and a specialist agent for each. Setup registers the server with Claude Desktop, Claude Code, Cursor, Windsurf and VS Code, backing up each config first.",
    highlights: [
      "Lockfile pins every skill and subagent to an approved commit and SHA-256 file hashes",
      "Holds updates that add network, secret or publish access until you review the diff",
      "36-rule static scanner runs in quarantine before anything is installed",
      "Refuses tampered files at read time, and offers no approve tool over MCP",
      "Phase playbooks and BM25 routing pick the skill and agent for each step",
    ],
    stack: ["Node.js", "JavaScript", "MCP", "Git"], repo: REPO.aiVault, links: [], images: shots("ai-vault"),
  },
  /* AR/VR & Game Development Lab Website. Sources: the owner (built the whole site; not live yet; repo private) and the
   * owner's notes (Second Brain: project README, daily log 23 Nov 2026). The code was not read, so only what the notes
   * say is here. No repo or live link until the repo is public and the site is deployed. No images yet. */
  {
    n: "W.11", id: "arvr-lab-website", title: "AR/VR & Game Development Lab Website", kind: "Website", year: "2026",
    status: "In development, not live yet", role: "Developer", credit: "Solo project",
    line: "The website for Daffodil International University's AR/VR & Game Development Lab, a server-rendered React Router 8 site.",
    overview: "The official web presence for the AR/VR & Game Development Lab at Daffodil International University, where I am President. I built the whole site. It is not live yet.",
    build: "The site is server-rendered with React Router 8, and its media is prepared for the web. Pages use looping videos with poster images. When a video cannot load, the Loop component shows its poster instead, and the hero reel and the lightbox fall back to posters the same way, with the hero rotating them every six seconds. The type check, the production build and a crawl of the internal links across all 47 pages pass.",
    highlights: [
      "Server-rendered React Router 8 site, 47 pages",
      "Looping videos fall back to their poster images when they cannot load",
      "Hero reel and lightbox keep working on posters alone",
      "Type check, build and internal link crawl pass",
    ],
    stack: ["React Router 8", "React", "TypeScript", "SSR"], links: [], images: shots("arvr-lab-website"),
  },
  /* Hotel Management System. Source: the public repo (MIT, one upload commit of 5 Feb 2026; built in 2025 per the owner),
   * every claim checked in code; draft confirmed by the owner. A team course project (OOP): course, university and
   * teammates stay off by the owner's choice; role from the owner. Left off: "reservation" (only the app's name), REST,
   * CSRF protection (no Spring Security) and tests (only contextLoads). Hotels and rooms only, no guest data. Images: real
   * screens of the app run locally (JDK 17) with made-up hotels and rooms, 27 Nov 2026. */
  {
    n: "W.12", id: "hotel-management", title: "Hotel Management System", kind: "Java web application, course project", year: "2025",
    status: "Completed", role: "Full-stack developer", credit: "Team project",
    line: "A Spring Boot web app for managing hotels and their rooms, with validated forms and Java entities mapped to the database by JPA.",
    overview: "A server-rendered web application for a list of hotels and the rooms in each. Staff can add, edit and delete hotels and rooms, list hotels by city, see each hotel's rooms and mark a room as available or occupied. A team project for an object-oriented programming course.",
    build: "The data model is written as Java classes, not SQL: Hotel and Room are JPA entities with a one-to-many link, and Spring Data JPA builds the tables and queries on an H2 in-memory database. Validation rules sit on the entities: a hotel needs a name of 2 to 100 characters, a city, a country and an address, and a room needs a positive nightly price and a room number and capacity of at least 1. Errors show back on the Thymeleaf forms. Controllers, services and repositories are separate layers joined by constructor injection, a global exception handler turns a bad id into a message on the hotel list, and deletes run only on POST requests.",
    highlights: [
      "Hotel and Room JPA entities with a one-to-many link",
      "Create, edit and delete for hotels and rooms",
      "Bean Validation on the entities, with errors shown on the forms",
      "Controller, service and repository layers with constructor injection",
      "Hotels by city, rooms by hotel, and Available or Occupied status",
    ],
    stack: ["Java 17", "Spring Boot", "Spring Data JPA", "Thymeleaf", "H2", "Maven"], repo: REPO.hotel, links: [], images: shots("hotel-management"),
  },
  /* Electronic Voting Machine. Source: the public repo (uploaded 7 Dec 2024; report dated 4 Dec 2024), every claim checked
   * in src/EVM_Code.ino; built on a breadboard (with the green and red LEDs, absent from the Tinkercad
   * image and the BOM) and in Tinkercad, and the role, per the owner; draft confirmed by the owner.
   * A five-person team course project: course, university and teammates stay off by the owner's choice. Left off: the
   * README's "secure", "tamper resistance", debounce and source files that do not exist. Images: the repo's Tinkercad
   * circuit and diagrams, no names or IDs. A student prototype: never claim it is secure, certified or used in an election. */
  {
    n: "W.13", id: "voting-machine", title: "Electronic Voting Machine", kind: "Embedded hardware, course project", year: "2024",
    status: "Student prototype", role: "Firmware, circuit and report", credit: "Team project, five students",
    line: "An Arduino Uno voting machine prototype with four vote buttons, a result button and live counts on a 16x2 I2C LCD.",
    overview: "A small electronic voting machine, built as a student team prototype for a four-way vote between departments: CSE, EEE, NFE and SWE. Each button press adds a vote, the running counts show on an LCD, and a fifth button shows the winner and clears the count. It was modelled in Tinkercad and built on a breadboard.",
    build: "An Arduino Uno reads five push buttons on pins D2 to D6 through its internal pull-ups. A 16x2 LCD on an I2C backpack (address 0x27) needs only the SDA and SCL pins: the top line names the four categories and the bottom line shows their counts. Each vote flashes a green LED. The result button lights a red LED and names the category with the most votes, or reports a tie or no votes, holds it for five seconds and resets the counts. My part was the firmware, the circuit and its Tinkercad model, and the report with its flowchart and workflow diagrams. Votes live only in memory, with no voter check and no storage: a teaching prototype, not a machine for a real election.",
    highlights: [
      "Arduino Uno firmware in C++: four vote buttons and a result button",
      "Live counts for four categories on a 16x2 I2C LCD",
      "Result screen names the winner, a tie or no votes, then resets",
      "Green and red LED feedback for votes and results",
      "Modelled in Tinkercad, then built on a breadboard",
    ],
    stack: ["Arduino Uno", "C++", "16x2 I2C LCD", "LiquidCrystal_I2C", "Tinkercad"], repo: REPO.evm, links: [], images: shots("voting-machine"),
  },
  /* DNS Client Monitor. Source: the public repo (MIT, commits 10 to 11 Dec 2025), dns_monitor.sh and the setup notes read;
   * draft confirmed by the owner. A team course project (Operating Systems): no role claimed. Left off: the README's
   * "enterprise-grade", "millisecond precision" and CPU/memory figures. A lab tool on a VirtualBox VM: never describe it as
   * watching anyone else's traffic. No images yet; any added must be lab captures with test queries only. */
  {
    n: "W.14", id: "dns-client-monitor", title: "DNS Client Monitor", kind: "Linux networking tool, course project", year: "2025",
    status: "Completed", credit: "Team project",
    line: "A Bash terminal monitor for a BIND9 DNS server that shows which clients are querying it in real time and blocks or unblocks them through the UFW firewall.",
    overview: "A live terminal dashboard for a BIND9 DNS server, built in a VirtualBox lab for an Operating Systems course project. It lists the clients that queried the server in the last 30 seconds and shows whether BIND9 is online. One key blocks a client from DNS or from the whole server.",
    build: "The script runs tcpdump on port 53 in the background. From each query it takes the client's address and the name it asked for, skipping localhost and the server's own address. A second loop redraws the screen every three seconds and drops clients that have been quiet for 30 seconds. Blocking adds a UFW deny rule, either for port 53 only or for all traffic, then checks that the rule is active. Unblocking deletes every rule for that address, including numbered ones, then reloads UFW and restarts BIND9. A statistics view lists the busiest clients, the most-queried names, the blocked addresses and the active deny rules, and quitting stops the capture and deletes the temporary files. The repo also holds the lab setup notes: forward and reverse zones for a lab domain, UFW rules, and a two-level OpenSSL certificate authority whose server certificate serves the lab site over HTTPS in XAMPP.",
    highlights: [
      "Live client list from a tcpdump capture on port 53, with a 30-second activity timeout",
      "One-key UFW blocking, DNS only or all traffic, checked after each change",
      "Unblock removes every matching rule, reloads UFW and restarts BIND9",
      "Statistics: top clients, most-queried names, blocked addresses and deny rules",
      "Lab setup notes for BIND9 zones, UFW and an OpenSSL root CA and sub-CA for HTTPS",
    ],
    stack: ["Bash", "BIND9", "tcpdump", "UFW", "Linux", "OpenSSL"], repo: REPO.dnsMonitor, links: [], images: shots("dns-client-monitor"),
  },
  /* ShadowAstra Atlas. Sources: shadowastra-atlas.vercel.app (home, Team page, footer v1.0) and the team lead's public repo
   * README (stack, team, SI use: "the narration is the real voice of Mohammed Mahmud Parvez and the music is his own").
   * His part is film and motion; the app, data pipeline and models are the team's work: describe them as the product,
   * never as his. The Lab's CREDIT (L.02) is this same work: its date was Oct 2023, corrected to Oct 2026 by the owner. */
  {
    n: "W.15", id: "shadow-astra-atlas", title: "ShadowAstra Atlas", kind: "Web app, NASA Space Apps 2026", year: "2026",
    status: "Released, v1.0", role: "Film & motion", credit: "Team ShadowAstra, led by Abdullah Rubab",
    line: "A web app that measures every land area on Earth with NASA data to find places where crews can practise for a Moon base or a Mars mission.",
    overview: "Team ShadowAstra built it in Dhaka for the 2026 NASA Space Apps Challenge, which asks teams to find places on Earth that stand in for the planned Moon base locations and Mars. It scores 80,206 land areas for the job you pick and says plainly what Earth can't copy.",
    build: "I do film and motion for the team: I edit its films, shape its motion language and narrate the demo film, with my own music. The app is a static React 19 and three.js site. A Python pipeline measures every land area with NASA POWER, MODIS, SRTM and EMIT data, and the Moon and Mars with LRO LOLA and MGS MOLA heights. A learned model trained on 38 known test sites ranks them.",
    highlights: [
      "Film and motion: edited and narrated the demo film, with original music",
      "80,206 land areas scored with NASA data and re-ranked live in the browser",
      "Compare: Earth and Moon or Mars ground side by side at the same scale",
      "Lessons and a quiz in English, Spanish and Bangla",
    ],
    stack: ["React", "three.js", "TypeScript", "Python", "XGBoost", "NASA open data"], repo: REPO.shadowAstra,
    links: [
      { label: "Live site", href: "https://shadowastra-atlas.vercel.app/" },
      { label: "Open dataset", href: "https://huggingface.co/datasets/ABRUBAB/shadowastra-atlas" },
    ],
    images: shots("shadow-astra-atlas"),
  },
  /* Medyx. Source: the private repo (main 0fe7d38, commits 2 to 5 Nov 2026), README, AGENTS.md and docs/; run locally
   * as a Windows build on 27 Nov 2026. Private repo: no repo field. Solo, in development, OK to show: the owner.
   * Medication intake and alarms are not in the pushed code: never describe them as built. */
  {
    n: "W.16", id: "medyx", title: "Medyx", kind: "Medication reminder app, Android", year: "2026",
    status: "In development", role: "Solo developer", credit: "Solo project",
    line: "An offline-first Flutter medication reminder for Android, with an always-encrypted database and a scheduling engine for interval doses.",
    overview: "A medication reminder built so the person always knows what to take, whether it was taken, and what the app does not know. It needs no account, makes no network calls for core features and sends no telemetry. It moves reminder times only and never calculates or changes a dose. Today, Settings, routine hours and Elder mode work now; adding medications and the alarms come next.",
    build: "The Flutter app uses Riverpod and is split into packages: a pure-Dart domain, a data layer that alone touches SQL, a native alarm bridge and a design system. The database is Drift on SQLite3MultipleCiphers, always encrypted, with its key in the Android Keystore. The scheduling engine plans fixed times, times anchored to the saved routine, and a rolling interval for doses like eye drops every two hours: the first on waking, then every N hours until bedtime. Unit tests cover its rules. Elder mode uses large type and puts Settings behind a PIN with a recovery code, both stored as salted hashes.",
    highlights: [
      "Encrypted database: SQLite3MultipleCiphers, key in the Android Keystore",
      "Engine for fixed, routine-anchored and rolling doses, with unit tests",
      "Elder mode with a PIN and recovery code",
      "Alarm Reliability Doctor for notification, alarm and battery settings",
      "No account, no network for core features, no telemetry",
    ],
    stack: ["Flutter", "Dart", "Riverpod", "Drift", "SQLite3MultipleCiphers", "Android"], links: [], images: shots("medyx"),
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
