import { createHash } from "node:crypto";
import { inflateSync } from "node:zlib";
import type { Project, StatSource } from "./site";

/*
 * The two live numbers under every project, each configured in lib/site.ts
 * as a source this file knows how to read. Nothing here needs a key.
 *
 * Repos are read over git's own wire protocol (what `git clone` speaks), not
 * through GitHub's REST API, so there is no API key and no API rate limit:
 * one request for the tree of the default branch, one for exactly the files
 * a number needs. A number is then a count of files, a count of matches in
 * a file, or a number written in one. "Lines of code" counts the non-blank
 * lines of the hand-written source of every repo of a project; anything
 * generated, minified, vendored or translated is left out.
 *
 * Product numbers (games played, downloads, houses) come from public JSON
 * endpoints of the projects themselves or of Modrinth.
 *
 * Served as /stats.json, rebuilt in the background at most every 15
 * minutes; the visitor's browser only ever asks this site.
 */

export type Stat = { label: string; value: number; format?: "compact"; suffix?: string };
export type Stats = { at: string; projects: Record<string, Stat[]> };

const UA = "portfolio-stats";
const TIMEOUT = 20_000;
/** no single answer may grow past this; a repo that does is not counted */
const MAX_PACK = 48 * 1024 * 1024;

// --------------------------------------------------------------------------
// git smart HTTP, protocol version 2
// --------------------------------------------------------------------------

type Repo = { owner: string; repo: string };

function repoOf(url: string): Repo | null {
  const u = new URL(url);
  if (u.host !== "github.com") return null;
  const [owner, repo] = u.pathname.split("/").filter(Boolean);
  return owner && repo ? { owner, repo: repo.replace(/\.git$/, "") } : null;
}

const pktLine = (s: string) => {
  const b = Buffer.from(s);
  return Buffer.concat([Buffer.from((b.length + 4).toString(16).padStart(4, "0")), b]);
};

/** one command to the repo's upload-pack service */
async function upload({ owner, repo }: Repo, command: string, args: string[]) {
  const body = Buffer.concat([
    pktLine(`command=${command}\n`),
    pktLine(`agent=${UA}\n`),
    Buffer.from("0001"),
    ...args.map((a) => pktLine(`${a}\n`)),
    Buffer.from("0000"),
  ]);
  const res = await fetch(`https://github.com/${owner}/${repo}.git/git-upload-pack`, {
    method: "POST",
    headers: {
      "content-type": "application/x-git-upload-pack-request",
      accept: "application/x-git-upload-pack-result",
      "git-protocol": "version=2",
      "user-agent": UA,
    },
    body,
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT),
  });
  if (!res.ok || !res.body) throw new Error(`${owner}/${repo}: ${command} ${res.status}`);
  return res.body;
}

/**
 * Reads the pkt-lines of an answer. Before the "packfile" line they are
 * returned as text; after it, side band 1 is the pack, joined.
 */
async function answer(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  const lines: string[] = [];
  const pack: Buffer[] = [];
  let packed = 0;
  let inPack = false;
  let buf = Buffer.alloc(0);
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (value) buf = Buffer.concat([buf, value]);
      let i = 0;
      while (i + 4 <= buf.length) {
        const n = parseInt(buf.toString("latin1", i, i + 4), 16);
        if (Number.isNaN(n)) throw new Error("not a git response");
        if (n < 4) {
          i += 4;
          continue;
        }
        if (i + n > buf.length) break;
        const data = buf.subarray(i + 4, i + n);
        i += n;
        if (!inPack) {
          const text = data.toString();
          if (text === "packfile\n") inPack = true;
          else lines.push(text.replace(/\n$/, ""));
        } else if (data[0] === 1) {
          pack.push(Buffer.from(data.subarray(1)));
          packed += data.length - 1;
          if (packed > MAX_PACK) throw new Error("pack too large");
        } else if (data[0] === 3) {
          throw new Error(data.subarray(1).toString());
        }
      }
      buf = buf.subarray(i);
      if (done) break;
    }
  } finally {
    reader.cancel().catch(() => undefined);
  }
  return { lines, pack: Buffer.concat(pack) };
}

/** a pack of the objects asked for, every object by id */
async function fetchObjects(r: Repo, args: string[]) {
  const { pack } = await answer(await upload(r, "fetch", ["no-progress", "ofs-delta", ...args, "done"]));
  return unpack(pack);
}

/** the commit the default branch points at */
async function head(r: Repo) {
  const { lines } = await answer(await upload(r, "ls-refs", ["symrefs", "ref-prefix HEAD"]));
  const sha = lines.map((l) => l.split(" ")).find((p) => p[1] === "HEAD")?.[0];
  if (!sha || !/^[0-9a-f]{40}$/.test(sha)) throw new Error(`${r.owner}/${r.repo}: no HEAD`);
  return sha;
}

type GitObject = { type: string; data: Buffer };
const TYPES: Record<number, string> = { 1: "commit", 2: "tree", 3: "blob", 4: "tag" };

/** a delta applied to its base (git's copy/insert format) */
function patch(base: Buffer, delta: Buffer) {
  let i = 0;
  const size = () => {
    let v = 0;
    let shift = 0;
    let c: number;
    do {
      c = delta[i++];
      v += (c & 127) * 2 ** shift;
      shift += 7;
    } while (c & 128);
    return v;
  };
  size();
  const out = Buffer.alloc(size());
  let o = 0;
  while (i < delta.length) {
    const op = delta[i++];
    if (op & 128) {
      let off = 0;
      let n = 0;
      for (let b = 0; b < 4; b++) if (op & (1 << b)) off += delta[i++] * 2 ** (8 * b);
      for (let b = 0; b < 3; b++) if (op & (16 << b)) n += delta[i++] * 2 ** (8 * b);
      o += base.copy(out, o, off, off + (n || 0x10000));
    } else {
      o += delta.copy(out, o, i, i + op);
      i += op;
    }
  }
  return out;
}

/** every object in a pack, by id, deltas resolved */
function unpack(pack: Buffer) {
  if (pack.toString("latin1", 0, 4) !== "PACK") throw new Error("no pack");
  const count = pack.readUInt32BE(8);
  const byOffset = new Map<number, GitObject>();
  const byId = new Map<string, GitObject>();
  const deltas: { at: number; base: number | string; data: Buffer }[] = [];
  const keep = (at: number, type: string, data: Buffer) => {
    const id = createHash("sha1").update(`${type} ${data.length}\0`).update(data).digest("hex");
    const obj = { type, data };
    byOffset.set(at, obj);
    byId.set(id, obj);
  };
  let i = 12;
  for (let k = 0; k < count; k++) {
    const at = i;
    let c = pack[i++];
    const type = (c >> 4) & 7;
    while (c & 128) c = pack[i++];
    let base: number | string | null = null;
    if (type === 6) {
      c = pack[i++];
      let back = c & 127;
      while (c & 128) {
        c = pack[i++];
        back = (back + 1) * 128 + (c & 127);
      }
      base = at - back;
    } else if (type === 7) {
      base = pack.toString("hex", i, i + 20);
      i += 20;
    }
    // the compressed length is not stored: inflate tells how much it used
    const { buffer, engine } = inflateSync(pack.subarray(i), { info: true } as object) as unknown as {
      buffer: Buffer;
      engine: { bytesWritten: number };
    };
    i += engine.bytesWritten;
    if (base === null) keep(at, TYPES[type] ?? "?", buffer);
    else deltas.push({ at, base, data: buffer });
  }
  // a delta's base may itself be a delta: resolve until nothing moves
  let left = deltas;
  while (left.length) {
    const next = left.filter((d) => {
      const base = typeof d.base === "number" ? byOffset.get(d.base) : byId.get(d.base);
      if (!base) return true;
      keep(d.at, base.type, patch(base.data, d.data));
      return false;
    });
    if (next.length === left.length) break;
    left = next;
  }
  return byId;
}

/** the files of a tree, with their blob ids */
function* files(objects: Map<string, GitObject>, tree: string, prefix = ""): Generator<{ path: string; id: string }> {
  const data = objects.get(tree)?.data;
  if (!data) return;
  let i = 0;
  while (i < data.length) {
    const space = data.indexOf(32, i);
    const nul = data.indexOf(0, space);
    const mode = data.toString("latin1", i, space);
    const name = data.toString("utf8", space + 1, nul);
    const id = data.toString("hex", nul + 1, nul + 21);
    i = nul + 21;
    if (mode === "40000") yield* files(objects, id, `${prefix}${name}/`);
    else if (mode === "100644" || mode === "100755") yield { path: prefix + name, id };
  }
}

// --------------------------------------------------------------------------
// one repo: its tree, and any of its files, each fetched once per run
// --------------------------------------------------------------------------

type Snapshot = {
  files: { path: string; id: string }[];
  /** the files at these paths; each is downloaded once however often it is asked for */
  read: (paths: string[]) => Promise<Map<string, Buffer>>;
};

async function snapshot(r: Repo): Promise<Snapshot> {
  const sha = await head(r);
  // the commit and its trees, without a single file
  const objects = await fetchObjects(r, ["deepen 1", "filter blob:none", `want ${sha}`]);
  const root = objects.get(sha)?.data.toString("latin1").match(/^tree ([0-9a-f]{40})/)?.[1];
  if (!root) throw new Error(`${r.owner}/${r.repo}: no tree`);
  const list = [...files(objects, root)];
  const byPath = new Map(list.map((f) => [f.path, f.id]));
  const blobs = new Map<string, Promise<Buffer>>();
  return {
    files: list,
    async read(paths) {
      const ids = paths.map((p) => byPath.get(p)).filter((id): id is string => !!id);
      const missing = [...new Set(ids.filter((id) => !blobs.has(id)))];
      if (missing.length) {
        // exactly those files, in one pack
        const got = fetchObjects(r, missing.map((id) => `want ${id}`));
        for (const id of missing)
          blobs.set(
            id,
            got.then((all) => {
              const blob = all.get(id);
              if (!blob) throw new Error(`${r.owner}/${r.repo}: file missing`);
              return blob.data;
            }),
          );
      }
      const out = new Map<string, Buffer>();
      for (const p of paths) {
        const id = byPath.get(p);
        const blob = id ? blobs.get(id) : undefined;
        if (blob) out.set(p, await blob);
      }
      return out;
    },
  };
}

const snapshots = new Map<string, Promise<Snapshot>>();
function repoAt(url: string) {
  const r = repoOf(url);
  if (!r) throw new Error(`${url}: not a GitHub repo`);
  const key = `${r.owner}/${r.repo}`.toLowerCase();
  let hit = snapshots.get(key);
  if (!hit) {
    hit = snapshot(r);
    snapshots.set(key, hit);
  }
  return hit;
}

/** source code by extension */
const CODE = /\.(ts|tsx|js|jsx|mjs|cjs|java|kt|kts|swift|py|go|rs|c|cc|cpp|h|hpp|m|mm|glsl|vert|frag|wgsl|css|scss|vue|svelte|dart|sh)$/i;
/** not written here, or not code: dependencies, build output, generated, translations */
const NOT_OURS =
  /(^|\/)(node_modules|dist|build|out|vendor|third[_-]?party|external|\.next|coverage|generated|Pods|DerivedData|draco|i18n|l10n|locales?|lang|translations?|dictionaries|Strings)\/|\.(min|d|g|freezed)\.[a-z]+$|[.-]bundle\.|(^|\/)[^/]*(Strings|translations?|locales?)\.[a-z]+$/i;
/** a header that says the file was written by a tool */
const GENERATED = /@generated|auto-?generated|\bGENERATED\b|do not edit/i;

/** non-blank lines, or 0 for anything binary, generated or minified */
function countLines(data: Buffer) {
  if (data.includes(0)) return 0;
  const lines = data.toString("utf8").split("\n");
  if (lines.slice(0, 5).some((l) => GENERATED.test(l))) return 0;
  if (lines.some((l) => l.length > 1000)) return 0;
  return lines.filter((l) => l.trim()).length;
}

// --------------------------------------------------------------------------
// public JSON endpoints, each asked once per run
// --------------------------------------------------------------------------

const answers = new Map<string, Promise<unknown>>();
function getJson(url: string) {
  let hit = answers.get(url);
  if (!hit) {
    hit = fetch(url, {
      headers: { "user-agent": UA, accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT),
    }).then((res) => {
      if (!res.ok) throw new Error(`${url}: ${res.status}`);
      return res.json() as Promise<unknown>;
    });
    answers.set(url, hit);
  }
  return hit;
}

const field = (data: unknown, path: string) =>
  path.split(".").reduce<unknown>((v, k) => (v && typeof v === "object" ? (v as Record<string, unknown>)[k] : undefined), data);

// --------------------------------------------------------------------------

async function measure(p: Project, src: StatSource): Promise<number> {
  if ("fixed" in src) return src.fixed;
  if ("json" in src) {
    const data = await getJson(src.json);
    if (src.when && field(data, src.when) !== true) throw new Error(`${src.json}: not live`);
    const v = field(data, src.field);
    const n = Array.isArray(v) ? v.length : v;
    if (typeof n !== "number" || !Number.isFinite(n)) throw new Error(`${src.json}: no ${src.field}`);
    return n;
  }
  if ("lines" in src) {
    const all = await Promise.all(
      (p.codeFrom ?? [p.source]).map(async (url) => {
        const repo = await repoAt(url);
        const paths = repo.files.filter((f) => CODE.test(f.path) && !NOT_OURS.test(f.path)).map((f) => f.path);
        let total = 0;
        for (const data of (await repo.read(paths)).values()) total += countLines(data);
        return total;
      }),
    );
    return all.reduce((a, b) => a + b, 0);
  }
  const repo = await repoAt(src.repo ?? p.source);
  if ("files" in src) {
    const re = new RegExp(src.files);
    return repo.files.filter((f) => re.test(f.path)).length;
  }
  const where = new RegExp(src.in);
  const texts = [...(await repo.read(repo.files.filter((f) => where.test(f.path)).map((f) => f.path))).values()].map((b) =>
    b.toString("utf8"),
  );
  if (!texts.length) throw new Error(`${p.slug}: nothing matches ${src.in}`);
  if ("count" in src) {
    const re = new RegExp(src.count, "g");
    return texts.reduce((sum, t) => sum + t.split("\n").reduce((n, l) => n + (l.match(re)?.length ?? 0), 0), 0);
  }
  const re = new RegExp(src.value, "g");
  const found = texts.flatMap((t) => [...t.matchAll(re)].flatMap((m) => m.slice(1).filter((g) => g !== undefined)));
  if (!found.length) throw new Error(`${p.slug}: ${src.value} not found`);
  if (src.pick === "distinct") return new Set(found).size;
  const max = Math.max(...found.map((g) => Number(g.replace(/_/g, ""))));
  if (!Number.isFinite(max)) throw new Error(`${p.slug}: ${src.value} is not a number`);
  return Math.round(max * (src.scale ?? 1));
}

const total = (p: Project, from: StatSource | StatSource[]) =>
  Promise.all((Array.isArray(from) ? from : [from]).map((src) => measure(p, src))).then((parts) =>
    parts.reduce((a, b) => a + b, 0),
  );

/** the last complete count, reused within the refresh window (a dev server asks on every request) */
const FRESH_MS = 15 * 60 * 1000;
let last: { at: number; list: Project[]; result: Promise<{ stats: Stats; failed: string[] }> } | null = null;

/**
 * Every project's numbers. A number that cannot be counted right now is
 * left out rather than guessed; `failed` lists them.
 */
export function loadStats(list: Project[]) {
  if (last && last.list === list && Date.now() - last.at < FRESH_MS) return last.result;
  const result = count(list);
  last = { at: Date.now(), list, result };
  // only a complete count is kept
  result.then(
    (r) => r.failed.length && last?.result === result && (last = null),
    () => last?.result === result && (last = null),
  );
  return result;
}

async function count(list: Project[]) {
  snapshots.clear();
  answers.clear();
  const failed: string[] = [];
  const entries = await Promise.all(
    list.map(async (p) => {
      const got = await Promise.all(
        p.stats.map(async (s): Promise<Stat | null> => {
          try {
            const [sum, times] = await Promise.all([total(p, s.from), s.times ? total(p, s.times) : 1]);
            const stat: Stat = { label: s.label, value: sum * times };
            if (s.format) stat.format = s.format;
            if (s.suffix) stat.suffix = s.suffix;
            return stat;
          } catch (e) {
            failed.push(`${p.slug}/${s.label}: ${e instanceof Error ? e.message : String(e)}`);
            return null;
          }
        }),
      );
      return [p.slug, got.filter((s): s is Stat => !!s)] as const;
    }),
  );
  const stats: Stats = { at: new Date().toISOString(), projects: Object.fromEntries(entries) };
  return { stats, failed };
}
