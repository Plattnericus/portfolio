import { projects, site, skills } from "./site";

/*
 * The shell's file system: small, read-only, made from lib/site.ts so it
 * never says anything the page does not. Home holds a folder per project
 * (each with its README.md), a few text files and one hidden file.
 *
 *   /
 *   |-- dev/null
 *   `-- home/<user>/
 *       |-- .plan
 *       |-- about.txt
 *       |-- contact.txt
 *       |-- stack.txt
 *       `-- <project>/README.md
 */

export type Dir = { kind: "dir"; children: Record<string, Node> };
export type File = { kind: "file"; lines: () => string[] };
export type Node = Dir | File;

export const USER = site.name.toLowerCase();
export const HOME = `/home/${USER}`;

const dir = (children: Record<string, Node>): Dir => ({ kind: "dir", children });
const file = (lines: () => string[]): File => ({ kind: "file", lines });

/** what `cat .plan` prints; the secret's own line is added by the shell */
export const PLAN = ["build things that run.", "keep them fast, keep them locked."];

const home = dir({
  ".plan": file(() => PLAN),
  "about.txt": file(() => [`${site.name} / ${site.handle}`, `${site.role.toLowerCase()}. fullstack, devops, security.`, site.domain]),
  "contact.txt": file(() => [site.email, site.github]),
  "stack.txt": file(() => skills.map((s) => `${s.name.toLowerCase().padEnd(26)}${s.note}`)),
  ...Object.fromEntries(
    projects.map((p) => [
      p.slug,
      dir({
        "README.md": file(() => [
          `# ${p.name}`,
          "",
          `${p.kind}. ${p.description}`,
          "",
          `stack   ${p.tech.join(", ")}`,
          ...(p.live ? [`live    ${p.live.href}`] : []),
          `source  ${p.source}`,
        ]),
      }),
    ]),
  ),
});

const root = dir({
  dev: dir({ null: file(() => []) }),
  home: dir({ [USER]: home }),
});

/** an absolute, normalised path from `path` as typed in `cwd` (~ and .. understood) */
export function resolve(cwd: string, path: string) {
  let p = path.trim();
  if (p === "" || p === "~") return HOME;
  if (p.startsWith("~/")) p = `${HOME}/${p.slice(2)}`;
  else if (!p.startsWith("/")) p = `${cwd}/${p}`;
  const out: string[] = [];
  for (const part of p.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  return `/${out.join("/")}`;
}

export function lookup(path: string): Node | null {
  let node: Node = root;
  for (const part of path.split("/").filter(Boolean)) {
    if (node.kind !== "dir") return null;
    const next: Node | undefined = node.children[part];
    if (!next) return null;
    node = next;
  }
  return node;
}

/** the path as the prompt shows it: home is ~ */
export function pretty(path: string) {
  if (path === HOME) return "~";
  if (path.startsWith(`${HOME}/`)) return `~${path.slice(HOME.length)}`;
  return path;
}

/** names in a directory, sorted as ls sorts them (dotfiles mixed in by name) */
export function entries(d: Dir, all: boolean) {
  const names = Object.keys(d.children)
    .filter((n) => all || !n.startsWith("."))
    .sort((a, b) => a.replace(/^\./, "").localeCompare(b.replace(/^\./, "")));
  return all ? [".", "..", ...names] : names;
}

/** a believable size in bytes for ls -l */
export function size(node: Node) {
  if (node.kind === "dir") return 4096;
  return node.lines().reduce((a, l) => a + l.length + 1, 0);
}
