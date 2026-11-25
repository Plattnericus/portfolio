import type { Project } from "./site";

/*
 * The real code behind the projects, fetched from GitHub when the site is
 * built (and again at most once a day), never from the visitor's browser:
 * no API key, no rate limit, nothing for the visitor to wait on. For every
 * project it collects a handful of excerpts: the one configured in
 * lib/site.ts, plus functions picked at random from other source files of
 * the repo. They are served as /code.json, and a hover shows one at random.
 * If GitHub cannot be reached, a project simply has fewer (or no) excerpts.
 */

export type Snippet = {
  /** path inside the repo */
  path: string;
  /** first line number shown */
  start: number;
  lines: string[];
  /** the same lines on github.com */
  href: string;
};

const DAY = 60 * 60 * 24;
/** excerpts per project, the configured one included */
const PER_PROJECT = 6;
const FILES = 7;
const LINES = 14;

/** anything that looks like a credential keeps an excerpt off the page */
const SENSITIVE = /(api[_-]?key|secret|token|passw|bearer|authorization|private[_-]?key|BEGIN [A-Z ]*KEY|[A-Za-z0-9+/_-]{40,})/i;
/** the site is in English: excerpts with German comments, names or strings are skipped */
const FOREIGN = /[äöüßÄÖÜ]/;
const GERMAN = new Set(
  (
    "der die das und nicht wird für fuer mit wenn oder ein eine zum beim auch noch nur alle neue laden geladen " +
    "fehler eintrag kachel anzeigen speichern benutzer zeit stunde stunden lehrer klasse noten wetter aktuell " +
    "schliessen einstellungen sprache nachricht nachrichten datum woche monat jahr bild bilder seite fenster " +
    "zurueck weiter abbrechen loeschen hinzufuegen suche ergebnis platzhalter galerie fach heute morgen gestern " +
    "erste letzte titel inhalt ansicht schueler stundenplan gericht gerichte bewertung"
  ).split(" "),
);
const german = (line: string) =>
  line
    .split(/[^A-Za-z]+/)
    .flatMap((w) => w.split(/(?=[A-Z])/))
    .some((w) => w.length > 2 && GERMAN.has(w.toLowerCase()));
const SOURCE = /\.(ts|tsx|js|jsx|mjs|java|kt|dart|py|go|rs|glsl|swift)$/;
const SKIP = /(^|\/)(node_modules|dist|build|out|vendor|tests?|__tests__|spec|i18n|locales?|translations?|generated|draco|ios|android|macos|windows|linux|tools|scripts|\.github)\/|generated|registrant|test|\.(min|d|spec|g|freezed)\.|config\.|setup\.|\/(index|main)\.(js|ts)$/i;
/** where a function, method or class begins, in most languages */
const DECL =
  /^\s*(export\s+)?(default\s+)?(async\s+)?(function\s*\*?\s*\w+|class\s+\w+|(const|let)\s+\w+\s*=\s*(async\s*)?(\([^)]*\)|\w+)\s*=>|(public|private|protected|static|final|override)\b[^=;]*\([^;]*\)\s*\{|def\s+\w+|fn\s+\w+|func\s+\w+|[A-Za-z_<>[\],?\s]+\s+\w+\([^;=]*\)\s*(async\s*)?\{)/;

function repoOf(source: string) {
  const [owner, repo] = new URL(source).pathname.split("/").filter(Boolean);
  return owner && repo ? { owner, repo } : null;
}

async function get(url: string, json = false) {
  try {
    const res = await fetch(url, {
      next: { revalidate: DAY },
      signal: AbortSignal.timeout(8000),
      headers: { "user-agent": "portfolio-build" },
    });
    if (!res.ok) return null;
    return json ? await res.json() : await res.text();
  } catch {
    return null;
  }
}

/** the repo's files with their sizes: jsDelivr first (no limits), GitHub's tree as a fallback */
async function listFiles(owner: string, repo: string): Promise<{ path: string; size: number }[]> {
  for (const ref of ["main", "master"]) {
    const data = (await get(`https://data.jsdelivr.com/v1/packages/gh/${owner}/${repo}@${ref}?structure=flat`, true)) as {
      files?: { name: string; size: number }[];
    } | null;
    if (data?.files) return data.files.map((f) => ({ path: f.name.replace(/^\//, ""), size: f.size }));
  }
  const tree = (await get(`https://api.github.com/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`, true)) as {
    tree?: { path: string; size?: number; type: string }[];
  } | null;
  return (tree?.tree ?? []).filter((t) => t.type === "blob").map((t) => ({ path: t.path, size: t.size ?? 0 }));
}

/** lines from `from` on, dedented, without trailing blank lines */
function cut(all: string[], from: number, count: number) {
  const lines = all.slice(from, from + count).map((l) => l.replace(/\t/g, "  ").replace(/\s+$/, ""));
  while (lines.length && !lines[lines.length - 1]) lines.pop();
  const indent = Math.min(...lines.filter(Boolean).map((l) => l.length - l.trimStart().length));
  return lines.map((l) => l.slice(indent));
}

/** worth showing: real code, readable, nothing private, in English */
function good(lines: string[]) {
  if (lines.length < 8) return false;
  if (lines.some((l) => SENSITIVE.test(l) || FOREIGN.test(l) || german(l) || l.length > 130)) return false;
  const blank = lines.filter((l) => !l.trim()).length;
  const text = lines.join("").replace(/\s/g, "").length;
  return blank <= 3 && text / lines.length > 12;
}

const shuffle = <T,>(a: T[]) => {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const rawUrl = (owner: string, repo: string, path: string) =>
  `https://raw.githubusercontent.com/${owner}/${repo}/HEAD/${path}`;

async function load(p: Project): Promise<Snippet[]> {
  const repo = repoOf(p.source);
  if (!repo) return [];
  const out: Snippet[] = [];
  const add = (base: string, path: string, start: number, lines: string[]) => {
    out.push({
      path,
      start: start + 1,
      lines,
      href: `${base}/blob/HEAD/${path}#L${start + 1}-L${start + lines.length}`,
    });
  };

  // the configured excerpt first
  if (p.code) {
    const text = await get(rawUrl(repo.owner, repo.repo, p.code.path));
    if (typeof text === "string") {
      const all = text.replace(/\r\n?/g, "\n").split("\n");
      const at = all.findIndex((l) => l.includes(p.code?.at ?? ""));
      if (at >= 0) {
        const lines = cut(all, at, p.code.lines ?? 16);
        if (!lines.some((l) => SENSITIVE.test(l))) add(p.source, p.code.path, at, lines);
      }
    }
  }

  // then functions from other source files, at random, across every repo
  // the project is made of
  const repos = (p.codeFrom ?? [p.source]).flatMap((url) => {
    const r = repoOf(url);
    return r ? [{ ...r, url: url.replace(/\/+$/, "") }] : [];
  });
  const lists = await Promise.all(
    repos.map(async (r) =>
      (await listFiles(r.owner, r.repo)).map((f) => ({ ...f, repo: r })),
    ),
  );
  const files = shuffle(
    lists
      .flat()
      .filter(
        (f) =>
          SOURCE.test(f.path) &&
          !SKIP.test(f.path) &&
          f.size > 600 &&
          f.size < 70_000 &&
          !(f.repo.url === p.source && f.path === p.code?.path),
      ),
  ).slice(0, FILES);
  const texts = await Promise.all(files.map((f) => get(rawUrl(f.repo.owner, f.repo.repo, f.path))));
  texts.forEach((text, k) => {
    if (typeof text !== "string") return;
    const all = text.replace(/\r\n?/g, "\n").split("\n");
    const starts = shuffle(all.map((l, i) => (DECL.test(l) ? i : -1)).filter((i) => i >= 0));
    let taken = 0;
    for (const at of starts) {
      if (taken >= 2 || out.length >= PER_PROJECT) break;
      const lines = cut(all, at, LINES);
      if (!good(lines)) continue;
      add(files[k].repo.url, files[k].path, at, lines);
      taken++;
    }
  });
  return out.slice(0, PER_PROJECT);
}

/** a few excerpts per project slug */
export async function loadExcerpts(list: Project[]) {
  const got = await Promise.all(list.map(load));
  return Object.fromEntries(list.map((p, i) => [p.slug, got[i]])) as Record<string, Snippet[]>;
}
