export const siteConfig = {
  name: "Nexor / Plattnericus",
  shortName: "Nexor",
  domain: "plattnericus.dev",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://plattnericus.dev",
  title: "Nexor / Plattnericus | Fullstack, DevOps & Cybersecurity",
  description:
    "Nexor / Plattnericus builds real fullstack projects, interactive web experiences, DevOps infrastructure and security-focused systems.",
  role: "Fullstack Developer · DevOps Enthusiast · Cybersecurity in Progress",
  claim: "Building reliable software, infrastructure and security-focused systems.",
  github: "https://github.com/Plattnericus",
  modrinth: "https://modrinth.com/user/Plattnericus",
  email: "mailme@plattnericus.dev",
  locale: "en_US",
  keywords: [
    "Nexor",
    "Plattnericus",
    "Fullstack Developer",
    "DevOps",
    "Cybersecurity",
    "Next.js Developer",
    "TypeScript",
    "Docker",
    "Linux",
    "Cloudflare",
    "Selfhosting",
    "South Tyrol Developer",
    "Three.js",
    "WebGL",
    "POKYH",
    "Fly Lab",
    "Fruit fly connectome",
    "ThreeJS Portfolio",
    "StreamDeck",
    "Magic-Mirror",
    "Minesweeper",
    "ProjectilePreview-Mod",
  ],
} as const;

export const absoluteUrl = (path = "/") => {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return new URL(normalizedPath, siteConfig.url).toString();
};
