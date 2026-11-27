import type { Form } from "./world/shaders";

/*
 * Everything about the site lives here. The address comes from the
 * environment (NEXT_PUBLIC_SITE_URL, or the production URL Vercel provides),
 * so previews and forks never point at the wrong domain; the fallback is the
 * real one.
 */
function siteUrl() {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "") ||
    "https://plattnericus.dev";
  return raw.replace(/\/+$/, "");
}

const url = siteUrl();
const domain = new URL(url).host;

export const site = {
  name: "Nexor",
  handle: "Plattnericus",
  role: "Fullstack Developer",
  /** the line the About section prints */
  line: "I build things that run.",
  url,
  domain,
  title: "NEXOR / Plattnericus: fullstack, devops, security",
  description:
    "Portfolio of Nexor / Plattnericus. Fullstack apps, the servers under them and the locks on the doors, drawn entirely in characters.",
  github: "https://github.com/Plattnericus",
  modrinth: "https://modrinth.com/user/Plattnericus",
  email: process.env.NEXT_PUBLIC_CONTACT_EMAIL || "mailme@plattnericus.dev",
  keywords: [
    "Nexor",
    "Plattnericus",
    "fullstack developer",
    "Next.js developer",
    "TypeScript",
    "Three.js",
    "WebGL",
    "ASCII art",
    "creative development",
    "DevOps",
    "Docker",
    "Cloudflare",
    "selfhosting",
    "security",
    "portfolio",
  ],
  colors: { bg: "#08080a", fg: "#efeae2", accent: "#ff5a2e" },
} as const;

/** "Nexor / Plattnericus" */
export const author = `${site.name} / ${site.handle}`;

/**
 * Where a live number under a project comes from. lib/stats.ts reads it
 * again every few minutes, from the repo itself (over git, `repo` defaults
 * to the project's `source`) or from an endpoint. Patterns are regular
 * expressions, matched line by line unless noted.
 */
export type StatSource =
  /** non-blank lines of hand-written code across every repo of the project */
  | { lines: true }
  /** files whose path matches */
  | { repo?: string; files: string }
  /** every match of `count` in the files whose path matches `in` */
  | { repo?: string; in: string; count: string }
  /**
   * numbers captured by `value` (over the whole file) in the files whose path
   * matches `in`: the largest, or how many different ones there are
   */
  | { repo?: string; in: string; value: string; pick: "max" | "distinct"; scale?: number }
  /**
   * a field of a JSON endpoint (a list counts its items; `a.b` reads nested);
   * `when` must be true. `key` sends the environment variable `env` as the
   * header `header`: it is read on the server only and never reaches a browser.
   */
  | { json: string; field: string; when?: string; key?: { header: string; env: string } }
  /** a number given by hand, for what no public source counts */
  | { fixed: number };

/**
 * One number and its caption. Several sources are added up, and `times`
 * multiplies the sum. `compact` prints 14.3k instead of 14,326; `suffix`
 * follows the number (120+).
 *
 * `refresh` (seconds) makes it a live number: it is served by /live.json
 * instead of /stats.json, read at most that often, and the page asks again
 * at that pace while the project is on screen. Meant for endpoints, not git.
 */
export type ProjectStat = {
  label: string;
  from: StatSource | StatSource[];
  times?: StatSource;
  format?: "compact";
  suffix?: string;
  refresh?: number;
};

export type Project = {
  name: string;
  slug: string;
  kind: string;
  description: string;
  tech: string[];
  live: { href: string; label: string } | null;
  source: string;
  clip: string;
  /** the two numbers under it, counted live (lib/stats.ts) */
  stats: ProjectStat[];
  /** focus point of the 4:3 crop, 0..1 */
  focus?: [number, number];
  /**
   * The excerpt shown when hovering the source link: a file in the repo and
   * a line to start at. Fetched from GitHub at build time (lib/snippets.ts),
   * so it is always the real, current code.
   */
  code?: { path: string; at: string; lines?: number };
  /** repos the random excerpts are drawn from; just `source` when left out */
  codeFrom?: string[];
};

const POKYH_STATS = "https://api.pokyh.com/stats";
const POKYH_KEY = { header: "X-API-Key", env: "POKYH_API" };

export const projects: Project[] = [
  {
    name: "POKYH",
    slug: "pokyh",
    kind: "school platform",
    description: "Timetable, grades and messages for a real school.",
    tech: ["Next.js", "TypeScript", "Docker", "Cloudflare"],
    live: { href: "https://pokyh.com", label: "pokyh.com" },
    source: "https://github.com/bedchem/pokyh-frontend",
    code: { path: "lib/timetable-logic.ts", at: "export function buildSlots", lines: 16 },
    codeFrom: [
      "https://github.com/bedchem/pokyh-frontend",
      "https://github.com/bedchem/pokyh-backend",
      "https://github.com/bedchem/POKYH_IOS",
      "https://github.com/bedchem/POKYH_ANDROID",
    ],
    // straight from POKYH's own API (key: POKYH_API on the server), every 30 s
    stats: [
      { label: "users", from: { json: POKYH_STATS, field: "users.total", key: POKYH_KEY }, refresh: 30 },
      { label: "schools", from: { json: POKYH_STATS, field: "schools", key: POKYH_KEY }, refresh: 30 },
    ],
    clip: "/clips/pokyh.mp4",
  },
  {
    name: "Fly Lab",
    slug: "fly-lab",
    kind: "a real fly brain",
    description: "60,001 real fly neurons, running in the browser.",
    tech: ["React Three Fiber", "Three.js", "Vite"],
    live: { href: "https://fly.pokyh.com", label: "fly.pokyh.com" },
    source: "https://github.com/bedchem/fruit-fly-hub",
    code: { path: "src/neural/simulation.js", at: "  tick(h) {", lines: 13 },
    stats: [
      { label: "neurons", from: { in: "^src/neural/cnsMeta\\.js$", value: '"neuronsDrawn":\\s*(\\d+)', pick: "max" } },
      // the measured synapses of the MaleCNS connectome, as the project states them
      { label: "synapses", from: { in: "^README\\.md$", value: "([\\d.]+)M synapses", pick: "max", scale: 1e6 } },
    ],
    clip: "/clips/fly_lab.mp4",
  },
  {
    name: "Stargazer Tree",
    slug: "threejs-portfolio",
    kind: "3D portfolio",
    description: "GitHub stars grown into a living WebGL world.",
    tech: ["Three.js", "WebGL", "GLSL"],
    live: { href: "https://threejs.plattnericus.dev", label: "threejs.plattnericus.dev" },
    source: "https://github.com/Plattnericus/Stargazer_Tree",
    code: { path: "lib/bonsai.ts", at: "export function bonsaiNodes", lines: 16 },
    stats: [
      // every stargazer of the repo is a house, counted by the site itself
      { label: "houses", from: { json: "https://threejs.plattnericus.dev/api/stargazers", field: "stargazers", when: "live" } },
      { label: "grass blades", from: { in: "^lib/quality\\.ts$", value: "grassBlades:\\s*([\\d_]+)", pick: "max" } },
    ],
    clip: "/clips/threejs_portfolio.mp4",
  },
  {
    name: "StreamDeck",
    slug: "streamdeck",
    kind: "browser desktop",
    description: "A whole desktop inside a browser tab.",
    tech: ["React", "JavaScript"],
    live: {
      href: "https://streamdeck.plattnericus.dev/desktop",
      label: "streamdeck.plattnericus.dev",
    },
    source: "https://github.com/Plattnericus/StreamDeck",
    code: { path: "src/routes/apps/Terminal.jsx", at: "const normalizePath = (p) =>", lines: 17 },
    stats: [
      // every key with a text, in all three languages (de, en, it)
      {
        label: "translated strings",
        from: { in: "^src/i18n/translations\\.js$", count: "(?<![\\w$'\"])[A-Za-z_$][\\w$]*\\s*:\\s*['\"`]" },
      },
      {
        label: "terminal commands",
        from: { in: "^src/routes/apps/Terminal\\.jsx$", count: "^ {6}[a-zA-Z][\\w-]*\\s*:\\s*(\\(|async\\b|function\\b)" },
      },
    ],
    clip: "/clips/streamdeck.mp4",
  },
  {
    name: "Magic-Mirror",
    slug: "magic-mirror",
    kind: "selfhosted display",
    description: "An always-on smart display on a Raspberry Pi.",
    tech: ["Node.js", "Raspberry Pi"],
    live: { href: "https://magicmirror.plattnericus.dev", label: "magicmirror.plattnericus.dev" },
    source: "https://github.com/bedchem/Magic-Mirror",
    code: { path: "src/utils/handTracking.js", at: "const rotateNormalizedPoint", lines: 20 },
    stats: [
      // the joints the hand skeleton links up, for each hand it follows
      {
        label: "hand points tracked",
        from: { in: "^src/components/HandTrackingService\\.jsx$", value: "\\[(\\d+),\\s*(\\d+)\\]", pick: "distinct" },
        times: { in: "^src/components/HandTrackingService\\.jsx$", count: "^const [A-Z]+_HAND_INDEX = \\d+;" },
      },
      { label: "widgets", from: { files: "^src/components/widgets/[^/]+Widget\\.jsx$" } },
    ],
    clip: "/clips/magicmirror.mp4",
  },
  {
    name: "Minesweeper",
    slug: "minesweeper",
    kind: "multiplayer classic",
    description: "The classic, rebuilt as real-time multiplayer.",
    tech: ["Socket.IO", "Grid algorithms"],
    live: { href: "https://minesweeper.plattnericus.dev", label: "minesweeper.plattnericus.dev" },
    source: "https://github.com/bedchem/Minesweeper",
    code: { path: "src/minesweeper.js", at: "function floodReveal", lines: 15 },
    stats: [
      { label: "games played", from: { json: "https://minesweeper.plattnericus.dev/api/getGlobalStats", field: "totalGamesPlayed" } },
      { label: "players", from: { json: "https://minesweeper.plattnericus.dev/api/getGlobalStats", field: "totalPlayers" } },
    ],
    clip: "/clips/minesweeper.mp4",
  },
  {
    name: "Projectile Preview",
    slug: "projectilepreview-mod",
    kind: "minecraft mod",
    description: "See where your arrow lands before you let go.",
    tech: ["Java", "Fabric"],
    live: { href: "https://modrinth.com/mod/projectile.preview", label: "modrinth" },
    source: "https://github.com/Ryhox/ProjectilePreview-Mod",
    // a mod is measured by the people who play it: Modrinth and CurseForge together
    stats: [
      {
        label: "downloads",
        from: [
          { json: "https://api.modrinth.com/v2/project/projectile.preview", field: "downloads" },
          { json: "https://api.cfwidget.com/minecraft/mc-mods/projectile-preview", field: "downloads.total" },
        ],
        format: "compact",
      },
    ],
    code: {
      path: "src/client/java/dev/duels/projectilepreview/client/projectile/TrajectorySim.java",
      at: "for (int i = 1; i <= steps; i++)",
      lines: 17,
    },
    clip: "/clips/projectile_preview.mp4",
  },
];

/**
 * The tools, each with the symbol the object turns into while it is named
 * (one of FORMS in lib/world/shaders.ts).
 */
export const skills: { name: string; note: string; shape: Form }[] = [
  { name: "Next.js & React", note: "this site, POKYH", shape: "atom" },
  { name: "Three.js & WebGL", note: "this site, Fly Lab, Stargazer Tree", shape: "cube" },
  { name: "TypeScript", note: "end to end, strict", shape: "code" },
  { name: "Docker & Linux", note: "POKYH ships in containers", shape: "containers" },
  { name: "Cloudflare & selfhosting", note: "POKYH behind Cloudflare, Magic-Mirror on a Pi", shape: "cloud" },
  { name: "APIs & backends", note: "real-time multiplayer in Minesweeper", shape: "network" },
  { name: "Security mindset", note: "hardening, sane auth, offensive skills", shape: "lock" },
];

/** what the About section builds, in order */
export const disciplines = ["interfaces", "backends", "servers", "security"];

export type Quote = { text: string; by: string; year?: number };

/**
 * Lines worth keeping. The first three have a place on the page: the first
 * between the work and the list of all projects, the next two in the footer,
 * one of them on every visit (`footerQuotes`). `fortune` in the shell draws
 * any of them.
 */
export const quotes: Quote[] = [
  { text: "Talk is cheap. Show me the code.", by: "Linus Torvalds", year: 2000 },
  // the footer's two, the site's own: make it work, then make it beautiful
  { text: "Make it work first. Beautiful software that doesn't run is just a screenshot.", by: site.handle },
  { text: "Make it work first. Then you get to make it beautiful.", by: site.handle },
  { text: "Simplicity is prerequisite for reliability.", by: "Edsger W. Dijkstra", year: 1975 },
  { text: "The best way to predict the future is to invent it.", by: "Alan Kay", year: 1971 },
  { text: "Security is a process, not a product.", by: "Bruce Schneier", year: 2000 },
  { text: "Premature optimization is the root of all evil.", by: "Donald Knuth", year: 1974 },
  { text: "Controlling complexity is the essence of computer programming.", by: "Brian Kernighan", year: 1976 },
  { text: "Make it work, make it right, make it fast.", by: "Kent Beck" },
  { text: "Real artists ship.", by: "Steve Jobs" },
  // went round as an image in 2025 (first posted by @growthbyvisuals); no
  // author has been found, the Elon Musk, Adam Grant and Shah Rukh Khan
  // credits it picked up on the way have no source
  { text: "Just make it exist first. You can make it good later.", by: "Unknown" },
  { text: "Any sufficiently advanced technology is indistinguishable from magic.", by: "Arthur C. Clarke", year: 1973 },
];

/** the footer draws one of its two lines on every visit, the second twice as often */
export const footerQuotes = [
  { index: 1, weight: 1 },
  { index: 2, weight: 2 },
] as const;

/** the four principles, worded as on the first version of the site */
export const principles = [
  { title: "One stack, every layer", line: "designed together, not glued together" },
  { title: "Ship it for real", line: "it only counts once it runs" },
  { title: "Locked down by default", line: "security is not a feature request" },
  // last, because the zoom right after it does exactly that
  { title: "Interfaces that pull you in", line: "motion with a purpose" },
];

/** GitHub's mark (github-mark.svg, 98x96). */
export const GITHUB_MARK =
  "M48.854 0C21.839 0 0 22 0 49.217c0 21.756 13.993 40.172 33.405 46.69 2.427.49 3.316-1.059 3.316-2.362 0-1.141-.08-5.052-.08-9.127-13.59 2.934-16.42-5.867-16.42-5.867-2.184-5.704-5.42-7.17-5.42-7.17-4.448-3.015.324-3.015.324-3.015 4.934.326 7.523 5.052 7.523 5.052 4.367 7.496 11.404 5.378 14.235 4.074.404-3.178 1.699-5.378 3.074-6.6-10.839-1.141-22.243-5.378-22.243-24.283 0-5.378 1.94-9.778 5.014-13.2-.485-1.222-2.184-6.275.486-13.038 0 0 4.125-1.304 13.426 5.052a46.97 46.97 0 0 1 12.214-1.63c4.125 0 8.33.571 12.213 1.63 9.302-6.356 13.427-5.052 13.427-5.052 2.67 6.763.97 11.816.485 13.038 3.155 3.422 5.015 7.822 5.015 13.2 0 18.905-11.404 23.06-22.324 24.283 1.78 1.548 3.316 4.481 3.316 9.126 0 6.6-.08 11.897-.08 13.526 0 1.304.89 2.853 3.316 2.364 19.412-6.52 33.405-24.935 33.405-46.691C97.707 22 75.788 0 48.854 0z";
