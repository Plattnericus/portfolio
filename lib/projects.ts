/** Every card preview is a short, muted, looping 4:3 clip. `poster` is not
    shown on the page — it is the still listed in the sitemap for image search. */
export type ProjectPreview = {
  kind: "video";
  src: string;
  poster: string;
  objectPosition?: string;
};

export type Project = {
  name: string;
  slug: string;
  /** GitHub repository name used to match live API data (may not be public yet). */
  repoName: string;
  eyebrow: string;
  description: string;
  tech: string[];
  liveUrl: string | null;
  githubUrl: string | null;
  /** Local-only media used by the Lenis-style project card. */
  preview: ProjectPreview;
};

export const projects: Project[] = [
  {
    name: "POKYH",
    slug: "pokyh",
    repoName: "POKYH",
    eyebrow: "School platform",
    description:
      "A school-focused platform built around real student workflows: timetable, grades, absences, messages, mobile app, backend, APIs and deployment.",
    tech: ["Next.js", "TypeScript", "API", "Docker", "Cloudflare"],
    liveUrl: "https://pokyh.com",
    githubUrl: "https://github.com/bedchem/POKYH",
    preview: {
      kind: "video",
      src: "/projects/pokyh.mp4",
      poster: "/showcase/pokyh.webp",
    },
  },
  {
    name: "Fly Lab",
    slug: "fly-lab",
    repoName: "fruit-fly-hub",
    eyebrow: "Real fly brain",
    description:
      "A real fruit-fly connectome running in the browser: a CT-scanned Drosophila whose 60,001 measured neurons (MaleCNS v1.0) drive it to gamble, trade, game and code on its own — one hub of experiments on the same brain.",
    tech: ["React Three Fiber", "Three.js", "Neural simulation", "Vite"],
    liveUrl: "https://fly.pokyh.com",
    githubUrl: "https://github.com/bedchem/fruit-fly-hub",
    preview: {
      /* the tail crossfades into the head, so the "so close" card at the end
         fades out instead of popping off at the loop */
      kind: "video",
      src: "/projects/fly_lab.mp4",
      poster: "/showcase/fly-lab.webp",
    },
  },
  {
    name: "ThreeJS Portfolio",
    slug: "threejs-portfolio",
    repoName: "Stargazer_Tree",
    eyebrow: "3D web experience",
    description:
      "An immersive 3D portfolio rendered in the browser: WebGL scenes, camera choreography and real-time lighting built with Three.js.",
    tech: ["Three.js", "WebGL", "GLSL", "JavaScript"],
    liveUrl: "https://threejs.plattnericus.dev",
    githubUrl: "https://github.com/Plattnericus/Stargazer_Tree",
    preview: {
      kind: "video",
      src: "/projects/threejs_portfolio.mp4",
      poster: "/showcase/threejs-portfolio.webp",
    },
  },
  {
    name: "StreamDeck",
    slug: "streamdeck",
    repoName: "StreamDeck",
    eyebrow: "Browser desktop",
    description:
      "An interactive web desktop with app-like windows, tools and a polished browser-based experience.",
    tech: ["React", "JavaScript", "Desktop UI", "Motion"],
    liveUrl: "https://streamdeck.plattnericus.dev/desktop",
    githubUrl: "https://github.com/Plattnericus/StreamDeck",
    preview: {
      kind: "video",
      src: "/projects/streamdeck.mp4",
      poster: "/showcase/streamdeck.webp",
    },
  },
  {
    name: "Magic-Mirror",
    slug: "magic-mirror",
    repoName: "Magic-Mirror",
    eyebrow: "Selfhosted smart display",
    description:
      "A wall-mounted smart display running on a Raspberry Pi: time, weather and daily information rendered as a calm always-on interface.",
    tech: ["JavaScript", "Node.js", "Raspberry Pi", "Selfhosting"],
    liveUrl: "https://magicmirror.plattnericus.dev",
    githubUrl: "https://github.com/bedchem/Magic-Mirror",
    preview: {
      kind: "video",
      src: "/projects/magicmirror.mp4",
      poster: "/showcase/magic-mirror.webp",
    },
  },
  {
    name: "Minesweeper",
    slug: "minesweeper",
    repoName: "Minesweeper",
    eyebrow: "Classic rebuilt",
    description:
      "The classic logic game rebuilt from scratch: clean grid state, flood reveals, flagging and a focused minimal interface.",
    tech: ["Game Logic", "Grid Algorithms", "UI"],
    liveUrl: "https://minesweeper.plattnericus.dev",
    githubUrl: "https://github.com/bedchem/Minesweeper",
    preview: {
      kind: "video",
      src: "/projects/minesweeper.mp4",
      poster: "/showcase/minesweeper.webp",
    },
  },
  {
    name: "ProjectilePreview-Mod",
    slug: "projectilepreview-mod",
    repoName: "ProjectilePreview-Mod",
    eyebrow: "Minecraft mod",
    description:
      "A game mod that renders the predicted flight path of projectiles in real time, directly inside the game world.",
    tech: ["Java", "Modding", "Physics"],
    liveUrl: "https://modrinth.com/mod/projectile.preview",
    githubUrl: "https://github.com/Ryhox/ProjectilePreview-Mod",
    preview: {
      /* both in-game takes in one seamless loop, crossfading between them */
      kind: "video",
      src: "/projects/projectile_preview.mp4",
      poster: "/showcase/projectilepreview-mod.webp",
    },
  },
];
