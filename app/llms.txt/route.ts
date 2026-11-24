import { author, projects, site, skills } from "@/lib/site";

export const dynamic = "force-static";

/** a plain-text summary for language models, built from the same data as the page */
export function GET() {
  const lines = [
    `# ${site.domain}`,
    "",
    `> ${site.description}`,
    "",
    `${author}, ${site.role.toLowerCase()}. Interfaces, backends, servers and security.`,
    "",
    `- Email: ${site.email}`,
    `- GitHub: ${site.github}`,
    `- Modrinth: ${site.modrinth}`,
    "",
    "## Projects",
    "",
    ...projects.map(
      (p) =>
        `- [${p.name}](${p.live?.href ?? p.source}): ${p.kind}. ${p.description} ${p.tech.join(", ")}. Source: ${p.source}`,
    ),
    "",
    "## Tools",
    "",
    ...skills.map((s) => `- ${s.name}: ${s.note}`),
    "",
  ];
  return new Response(lines.join("\n"), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
