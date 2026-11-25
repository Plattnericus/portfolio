"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { getLenis, scrollToTarget } from "@/lib/motion";
import { SECRETS, SHELL_EVENT, SPECIMEN_EVENT, foundSecrets, markSecret, openCinema, SEASONS_EVENT } from "@/lib/secrets";
import { SEASONS, WEATHER, chooseSeason, type Season } from "@/lib/seasons";
import { setMuted } from "@/lib/sound";
import { projects, quotes, site, skills } from "@/lib/site";
import { Snake } from "@/lib/snake";
import { N_MARK } from "@/lib/ascii/glyphs";
import { glyphTotal } from "@/lib/ascii/stats";
import { worldState } from "@/lib/world/state";
import { HOME, USER, entries, lookup, pretty, resolve, size as bytes, type Dir } from "@/lib/shell-fs";

type Tone = "dim" | "accent" | "input";
/** a printed line; `parts` colours it piece by piece (ls, tree) */
type Line = { text: string; tone?: Tone; lead?: string; parts?: { text: string; tone?: Tone }[] };

/** the N of Nexor Grid, two characters per module */
const LOGO = N_MARK.map((r) =>
  r.replace(/#/g, "@@").replace(/\./g, "  "),
);

const clock = (s: number) =>
  [s / 3600, (s / 60) % 60, s % 60].map((v) => String(Math.floor(v)).padStart(2, "0")).join(":");

/** system info, the way a terminal would print it */
function neofetch(): Line[] {
  const id = `${site.name.toLowerCase()}@${site.handle.toLowerCase()}`;
  const dpr = Math.round((window.devicePixelRatio || 1) * 10) / 10;
  // the stack, three to a line
  const stack: [string | null, string][] = [];
  for (let i = 0; i < skills.length; i += 3) {
    stack.push([i ? "" : "stack", skills.slice(i, i + 3).map((s) => s.name.toLowerCase()).join(", ")]);
  }
  const info: [string | null, string][] = [
    [null, id],
    [null, "-".repeat(id.length)],
    ["role", "fullstack, devops, security"],
    ...stack,
    ["site", site.domain],
    ["font", "Nexor Grid"],
    ["uptime", clock(performance.now() / 1000)],
    ["cells", `${glyphTotal().toLocaleString("en-US")} drawn`],
    ["screen", `${window.innerWidth}x${window.innerHeight} @${dpr}x`],
    ["secrets", `${foundSecrets().length} of ${SECRETS.length}`],
  ];
  // phones get the facts without the logo; it would wrap
  const narrow = window.innerWidth < 640;
  return info.map(([k, v], i) => ({
    lead: narrow ? "" : (LOGO[i] ?? "").padEnd(LOGO[0].length + 3),
    text: k === null ? v : `${k.padEnd(9)}${v}`,
  }));
}

const HOST = site.handle.toLowerCase();
/** the prompt in a folder, as bash draws it */
const promptAt = (cwd: string) => `${USER}@${HOST}:${pretty(cwd)}$`;
/** the window title, as a terminal sets it */
const titleAt = (cwd: string) => `${USER}@${HOST}: ${pretty(cwd)}`;
/** what reads a file */
const READERS = ["cat", "less", "more", "head", "tail", "bat"];

const SECTIONS: Record<string, string> = {
  home: "#hero",
  "~": "#hero",
  about: "#about",
  tools: "#skills",
  skills: "#skills",
  principles: "#principles",
  work: "#work",
  projects: "#index",
  contact: "#contact",
};

/** the commands `help` admits to; a few more are not on the list */
const PUBLIC: [string, string][] = [
  ["ls", "list the folder (-a hidden too, -l long)"],
  ["cd <dir>", "change folder; a project is a folder"],
  ["cat <file>", "print a file, like a project's README.md"],
  ["open <name>", "open a project (alone, inside its folder)"],
  ["cd <section>", "fly to about, tools, work, projects, contact"],
  ["stack", "what I build with"],
  ["whoami", "who this is"],
  ["mail", "write me"],
  ["warp", "full speed"],
  ["secrets", "how many you found"],
  ["mute", "no chime for a found secret (unmute)"],
  ["history", "what you typed"],
  ["clear", "clear the screen"],
  ["exit", "close the shell (esc)"],
];

/** the keys a terminal has, listed under help */
const KEYS: [string, string][] = [
  ["tab", "complete"],
  ["up / down", "walk the history"],
  ["ctrl+c", "cancel the line"],
  ["ctrl+l", "clear the screen"],
  ["ctrl+a / e", "start / end of the line"],
  ["ctrl+u", "delete to the start"],
  ["ctrl+d", "exit, on an empty line"],
  ["pgup / pgdn", "scroll"],
];

const COMMANDS = [...PUBLIC.map(([c]) => c.split(" ")[0]), "help", "pwd", "tree", "echo"];

function findProject(arg: string) {
  const n = Number(arg);
  if (Number.isInteger(n) && n >= 1 && n <= projects.length) return projects[n - 1];
  const a = arg.toLowerCase().replace(/[\s_-]+/g, "");
  return projects.find(
    (p) => p.slug.replace(/[\s_-]+/g, "").startsWith(a) || p.name.toLowerCase().replace(/[\s_-]+/g, "").startsWith(a),
  );
}

/** the longest start all of them share */
function shared(list: string[]) {
  return list.reduce((a, b) => {
    let i = 0;
    while (i < a.length && a[i] === b[i]) i++;
    return a.slice(0, i);
  });
}

/**
 * A small shell over the page: ` or ctrl/cmd + k. It lists and opens the
 * projects, flies the camera around, and knows a few things it does not
 * advertise. It behaves like a terminal: the prompt follows the output,
 * the cursor is a block, and the usual keys (tab, the history, ctrl+c, ctrl+l,
 * ctrl+a/e/u/d) do what they do in bash. The real input is invisible; the
 * line is drawn from its value and its selection.
 */
export default function Shell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [value, setValue] = useState("");
  // the folder the shell is in; the prompt and the title follow it
  const [cwd, setCwd] = useState(HOME);
  const PROMPT = promptAt(cwd);
  // where the caret is, and what is selected, so the block can be drawn there
  const [caret, setCaret] = useState({ s: 0, e: 0 });
  const [focused, setFocused] = useState(false);
  // columns x rows, as a terminal reports its size
  const [size, setSize] = useState("");
  // newest first and without repeats, for the arrow keys
  const history = useRef<string[]>([]);
  // everything, in order, for `history` and `!!`
  const log = useRef<string[]>([]);
  const hIndex = useRef(-1);
  // the line being typed before the history was walked; down brings it back
  const draft = useRef("");
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const outRef = useRef<HTMLDivElement>(null);
  const greeted = useRef(false);
  const [game, setGame] = useState(false);
  // inside the editor every line is an ex command until it is left
  const [vim, setVim] = useState(false);
  const gameRef = useRef<HTMLPreElement>(null);

  const print = useCallback((...add: Line[]) => setLines((l) => [...l, ...add].slice(-200)), []);

  // where edit() wants the caret, set once React has written the new value
  const place = useRef<number | null>(null);

  /** sets the line and puts the caret where it belongs */
  const edit = useCallback((next: string, at = next.length) => {
    place.current = at;
    setValue(next);
    setCaret({ s: at, e: at });
  }, []);

  useLayoutEffect(() => {
    if (place.current === null) return;
    inputRef.current?.setSelectionRange(place.current, place.current);
    place.current = null;
  });

  const sync = () => {
    const el = inputRef.current;
    if (!el) return;
    const end = el.value.length;
    setCaret({ s: el.selectionStart ?? end, e: el.selectionEnd ?? end });
  };

  const toggle = useCallback((v?: boolean) => {
    setOpen((o) => {
      const next = v ?? !o;
      if (next && !greeted.current) {
        greeted.current = true;
        setLines([{ text: `${site.domain} shell. type help.`, tone: "dim" }]);
      }
      return next;
    });
  }, []);

  // ` and ctrl/cmd + k open it anywhere, the shell's own line included; esc closes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA") && t !== inputRef.current;
      if (typing) return;
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "`" && !e.metaKey && !e.ctrlKey)) {
        e.preventDefault();
        toggle();
      } else if (e.key === "Escape") toggle(false);
    };
    const onEvent = () => toggle();
    window.addEventListener("keydown", onKey);
    window.addEventListener(SHELL_EVENT, onEvent);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(SHELL_EVENT, onEvent);
    };
  }, [toggle]);

  useEffect(() => {
    if (!open) return;
    getLenis()?.stop();
    inputRef.current?.focus({ preventScroll: true });
    return () => getLenis()?.start();
  }, [open]);

  // a phone's keyboard covers the bottom of the screen: sit on top of it
  useEffect(() => {
    const el = rootRef.current;
    const vv = window.visualViewport;
    if (!open || !el || !vv) return;
    const fit = () => {
      el.style.setProperty("--kb", `${Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop))}px`);
      el.style.setProperty("--vv", `${Math.round(vv.height)}px`);
    };
    fit();
    vv.addEventListener("resize", fit);
    vv.addEventListener("scroll", fit);
    return () => {
      vv.removeEventListener("resize", fit);
      vv.removeEventListener("scroll", fit);
    };
  }, [open]);

  useEffect(() => {
    const out = outRef.current;
    if (!open || !out) return;
    const ctx = document.createElement("canvas").getContext("2d");
    const measure = () => {
      if (!ctx) return;
      const cs = getComputedStyle(out);
      ctx.font = `${cs.fontSize} ${cs.fontFamily}`;
      const cw = ctx.measureText("0").width || 1;
      const lh = parseFloat(cs.lineHeight) || 1;
      setSize(`${Math.floor(out.clientWidth / cw)}x${Math.floor(out.clientHeight / lh)}`);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(out);
    return () => ro.disconnect();
  }, [open]);

  // new output, or a key typed, scrolls to the bottom, as a terminal does
  useLayoutEffect(() => {
    const out = outRef.current;
    if (out) out.scrollTop = out.scrollHeight;
  }, [lines, game, value, open]);

  // snake: the board takes the keys until q, esc or ctrl+c
  useEffect(() => {
    const el = gameRef.current;
    if (!game || !el) return;
    const narrow = window.innerWidth < 640;
    const snake = new Snake(el, narrow ? 22 : 36, narrow ? 12 : 14, (score) => {
      if (score >= 5) markSecret("snake");
    });
    const out = outRef.current;
    if (out) out.scrollTop = out.scrollHeight;
    const quit = () => {
      const score = snake.score;
      snake.destroy();
      setGame(false);
      setLines((l) => [...l, { text: `snake: ${score} eaten.`, tone: "dim" as const }]);
      setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 0);
    };
    const onKey = (e: KeyboardEvent) => {
      // the shell's own key closes it as usual, the game ends with it
      if (e.key === "`") return quit();
      if (e.key === "q" || e.key === "Escape" || (e.ctrlKey && e.key === "c")) quit();
      else if (!snake.key(e.key)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    inputRef.current?.blur();
    window.addEventListener("keydown", onKey, { capture: true });
    return () => {
      window.removeEventListener("keydown", onKey, { capture: true });
      snake.destroy();
    };
  }, [game]);

  /** ls: names in a row (folders end in /), or one per line with -l */
  const list = (args: string[]) => {
    const flags = args.filter((a) => a.startsWith("-")).join("");
    const all = flags.includes("a");
    const long = flags.includes("l");
    const targets = args.filter((a) => !a.startsWith("-"));
    const paths = targets.length ? targets : ["."];
    paths.forEach((t, k) => {
      const at = resolve(cwd, t);
      const node = lookup(at);
      if (!node) return print({ text: `ls: cannot access '${t}': No such file or directory`, tone: "dim" });
      if (paths.length > 1) print(...(k ? [{ text: "" }] : []), { text: `${t}:` });
      const names = node.kind === "dir" ? entries(node, all) : [t];
      const of = (n: string) =>
        node.kind !== "dir" ? node : n === "." ? node : n === ".." ? lookup(resolve(at, "..")) ?? node : node.children[n];
      const shown = (n: string) => (of(n).kind === "dir" && n !== "." && n !== ".." ? `${n}/` : n);
      if (long) {
        if (node.kind === "dir") print({ text: `total ${names.length * 4}` });
        print(
          ...names.map((n) => {
            const e = of(n);
            const d = e.kind === "dir";
            return {
              text: "",
              parts: [
                { text: `${d ? "drwxr-xr-x" : "-rw-r--r--"}  ${d ? 2 : 1} ${USER}  ${USER}  ${String(bytes(e)).padStart(5)}  `, tone: "dim" as const },
                { text: shown(n), tone: d ? ("accent" as const) : undefined },
              ],
            };
          }),
        );
      } else if (names.length) {
        print({
          text: "",
          parts: names.flatMap((n, i) => [
            ...(i ? [{ text: "  " }] : []),
            { text: shown(n), tone: of(n).kind === "dir" ? ("accent" as const) : undefined },
          ]),
        });
      }
    });
  };

  /** cat and friends; `.plan` at home is a secret */
  const read = (args: string[], cmd: string) => {
    const files = args.filter((a) => !a.startsWith("-"));
    if (!files.length) return print({ text: `${cmd}: which file? try ls`, tone: "dim" });
    files.forEach((t) => {
      const at = resolve(cwd, t);
      const node = lookup(at);
      if (!node) return print({ text: `${cmd}: ${t}: No such file or directory`, tone: "dim" });
      if (node.kind === "dir") return print({ text: `${cmd}: ${t}: Is a directory`, tone: "dim" });
      print(...node.lines().map((text) => ({ text })));
      if (at === `${HOME}/.plan`) {
        markSecret("dotfile");
        print({ text: `${foundSecrets().length} of ${SECRETS.length} secrets found so far.`, tone: "dim" });
      }
    });
  };

  /** the folder and everything under it, drawn as tree draws it */
  const tree = (t = ".") => {
    const node = lookup(resolve(cwd, t));
    if (!node) return print({ text: `${t} [error opening dir]`, tone: "dim" });
    if (node.kind !== "dir") return print({ text: t });
    const out: Line[] = [{ text: t, tone: "accent" }];
    let dirs = 0;
    let files = 0;
    const walk = (d: Dir, pre: string) => {
      const names = entries(d, false);
      names.forEach((n, i) => {
        const last = i === names.length - 1;
        const e = d.children[n];
        const folder = e.kind === "dir";
        out.push({
          text: "",
          parts: [
            { text: `${pre}${last ? "`-- " : "|-- "}`, tone: "dim" },
            { text: folder ? `${n}/` : n, tone: folder ? "accent" : undefined },
          ],
        });
        if (e.kind === "dir") {
          dirs++;
          walk(e, `${pre}${last ? "    " : "|   "}`);
        } else files++;
      });
    };
    walk(node, "");
    print(...out, { text: "" }, { text: `${dirs} directories, ${files} files`, tone: "dim" });
  };

  const run = (raw: string) => {
    let cmdline = raw.trim();
    if (vim) {
      print({ lead: ":", text: cmdline.replace(/^:/, ""), tone: "input" });
      if (/^:?(q!?|wq!?|x|qa!?)$/.test(cmdline)) {
        setVim(false);
        markSecret("vim");
        print({ text: "you got out. most people don't.", tone: "accent" });
      } else if (cmdline) {
        print({ text: `E492: Not an editor command: ${cmdline.replace(/^:/, "")}`, tone: "dim" });
      }
      return;
    }
    print({ lead: `${PROMPT} `, text: raw, tone: "input" });
    if (!cmdline) return;
    if (cmdline === "!!") {
      const last = log.current[log.current.length - 1];
      if (!last) return print({ text: "!!: event not found", tone: "dim" });
      print({ text: last });
      cmdline = last;
    }
    log.current = [...log.current, cmdline].slice(-500);
    history.current = [cmdline, ...history.current.filter((h) => h !== cmdline)].slice(0, 50);
    const [cmd, ...rest] = cmdline.split(/\s+/);
    const arg = rest.join(" ");
    const c = cmd.toLowerCase();

    if (c === "help") {
      print(
        ...PUBLIC.map(([k, v]) => ({ text: `  ${k.padEnd(14)}${v}` })),
        { text: "" },
        ...KEYS.map(([k, v]) => ({ text: `  ${k.padEnd(14)}${v}`, tone: "dim" as const })),
      );
    } else if (c === "ls" || c === "ll" || c === "la") {
      list(c === "ll" ? ["-l", ...rest] : c === "la" ? ["-a", ...rest] : rest);
    } else if (READERS.includes(c)) {
      read(rest, c);
    } else if (c === "tree") {
      tree(rest[0]);
    } else if (c === "fc-list") {
      print({ text: "app/fonts/NexorGrid.woff: Nexor Grid:style=Regular" });
      toggle(false);
      window.dispatchEvent(new Event(SPECIMEN_EVENT));
    } else if (c === "open") {
      // alone or as `open .`, inside a project's folder: that project
      const here = projects.find((q) => resolve(cwd, ".") === `${HOME}/${q.slug}`);
      const p = arg && arg !== "." ? findProject(arg.replace(/\/$/, "")) : here;
      if (!p) print({ text: arg ? `open: no project "${arg}". try ls` : "open: which one? try ls, then open <name>", tone: "dim" });
      else {
        const href = p.live?.href ?? p.source;
        print({ text: `opening ${href}`, tone: "accent" });
        window.open(href, "_blank", "noopener,noreferrer");
      }
    } else if (c === "cd") {
      const a = arg.trim();
      if (/^\/dev\/null\/?$/i.test(a)) {
        markSecret("singularity");
        print({ text: "falling...", tone: "accent" });
        setTimeout(() => router.push("/dev/null"), 500);
        return;
      }
      const to = resolve(cwd, a);
      const node = lookup(to);
      const section = SECTIONS[a.toLowerCase()];
      if (node?.kind === "dir") setCwd(to);
      else if (node) print({ text: `cd: not a directory: ${a}`, tone: "dim" });
      else if (section) {
        // not a folder but a part of the page: the camera flies there
        toggle(false);
        setTimeout(() => scrollToTarget(section, 3), 60);
      } else print({ text: `cd: no such file or directory: ${a}`, tone: "dim" });
    } else if (c === "pwd") {
      print({ text: cwd });
    } else if (c === "echo") {
      print({ text: arg.replace(/^(["'])(.*)\1$/, "$2") });
    } else if (c === "history") {
      print(...log.current.map((h, i) => ({ text: `${String(i + 1).padStart(5)}  ${h}` })));
    } else if (c === "stack") {
      print(...skills.map((s) => ({ text: `  ${s.name.toLowerCase().padEnd(24)}${s.note}` })));
    } else if (c === "whoami") {
      print({ text: `${site.name.toLowerCase()} / ${site.handle.toLowerCase()}. fullstack, devops, security.` });
    } else if (c === "mail" || c === "contact") {
      print({ text: site.email, tone: "accent" });
      window.location.href = `mailto:${site.email}`;
    } else if (c === "github") {
      window.open(site.github, "_blank", "noopener,noreferrer");
    } else if (c === "warp") {
      worldState.boost = 1;
      print({ text: "punch it.", tone: "accent" });
      toggle(false);
    } else if (c === "secrets") {
      const found = foundSecrets();
      print(
        { text: `${found.length} of ${SECRETS.length} found` },
        ...SECRETS.map((s) => ({ text: `  [${found.includes(s) ? "x" : " "}] ${found.includes(s) ? s : "?".repeat(s.length)}`, tone: "dim" as const })),
      );
    } else if (c === "clear") {
      setLines([]);
    } else if (c === "exit" || c === "q" || c === "quit" || c === "logout") {
      toggle(false);
    } else if (c === "mirror") {
      toggle(false);
      openCinema({ kind: "camera" });
    } else if (c === "reel") {
      toggle(false);
      openCinema({ kind: "reel" });
    } else if (c === "ascii") {
      print({ text: "drop any picture or video onto the page.", tone: "dim" });
    } else if (c === "sudo" || (c === "rm" && /-\w*r\w*f|-\w*f\w*r/.test(arg))) {
      markSecret("sudo");
      print({ text: c === "sudo" ? `${site.name.toLowerCase()} is not in the sudoers file. this incident will be reported.` : "not today.", tone: "accent" });
    } else if (c === "mute" || c === "unmute") {
      setMuted(c === "mute");
      print({ text: c === "mute" ? "quiet now, until you reload." : "the chime is back.", tone: "dim" });
    } else if ((c === "season" || c === "seasons") && arg === "off") {
      chooseSeason(null);
      print({ text: "the weather is off.", tone: "dim" });
    } else if (c === "season" || c === "seasons") {
      toggle(false);
      window.dispatchEvent(new Event(SEASONS_EVENT));
    } else if ((SEASONS as string[]).includes(c)) {
      chooseSeason(c as Season);
      print({ text: `${WEATHER[c as Season].line} on every page, until you reload.`, tone: "accent" });
    } else if (c === "neofetch" || c === "fastfetch") {
      markSecret("neofetch");
      print(...neofetch());
    } else if (c === "fortune") {
      markSecret("fortune");
      const q = quotes[Math.floor(Math.random() * quotes.length)];
      print({ text: `  "${q.text}"` }, { text: `      -- ${q.by}${q.year ? `, ${q.year}` : ""}`, tone: "dim" });
    } else if (c === "snake") {
      print({ text: "snake. eat five.", tone: "dim" });
      setGame(true);
    } else if (c === "vim" || c === "vi" || c === "nvim") {
      setVim(true);
      print(
        ...Array.from({ length: 4 }, () => ({ text: "~", tone: "dim" as const })),
        { text: `"${arg || "untitled"}" [New]`, tone: "dim" },
      );
    } else if (c === "coffee" || ((c === "brew" || c === "make") && /coffee/.test(arg))) {
      markSecret("coffee");
      print(
        { text: "      ( (" },
        { text: "       ) )" },
        { text: "    ........" },
        { text: "    |      |]" },
        { text: "    \\      /" },
        { text: "     `----'" },
        { text: "  brewed. back to work.", tone: "dim" },
      );
    } else if (c === "ping") {
      print({ text: `PONG from ${site.domain}: icmp_seq=1 ttl=64 time=0.${(Date.now() % 90) + 10} ms` });
    } else {
      print({ text: `${cmd}: command not found`, tone: "dim" });
    }
  };

  /**
   * tab: completes as far as it is sure, and lists the rest, as zsh does.
   * Commands first; after them names in the folder (folders end in /), and
   * for cd the sections of the page as well.
   */
  const complete = () => {
    const parts = value.split(" ");
    const cmd = parts[0].toLowerCase();
    const word = parts[parts.length - 1];
    const base = parts.slice(0, -1).join(" ");
    let pool: string[] = [];
    // the folder part of the word stays as typed; the rest is completed
    let lead = "";
    let stem = word;
    if (parts.length === 1) pool = COMMANDS;
    else if (cmd === "open" && parts.length === 2) pool = projects.map((q) => q.slug);
    else if (["cd", "ls", "ll", "la", "tree", ...READERS].includes(cmd)) {
      const cut = word.lastIndexOf("/") + 1;
      lead = word.slice(0, cut);
      stem = word.slice(cut);
      const d = lookup(resolve(cwd, lead || "."));
      const onlyDirs = cmd === "cd" || cmd === "tree";
      if (d?.kind === "dir") {
        pool = entries(d, stem.startsWith("."))
          .filter((n) => n !== "." && n !== ".." && (!onlyDirs || d.children[n].kind === "dir"))
          .map((n) => (d.children[n].kind === "dir" ? `${n}/` : n));
      }
      if (cmd === "cd" && !lead) pool.push(...Object.keys(SECTIONS).filter((s) => s !== "~"));
    }
    const hit = [...new Set(pool)].filter((s) => s.toLowerCase().startsWith(stem.toLowerCase()));
    if (!hit.length) return;
    const one = hit.length === 1 ? hit[0] : null;
    const sure = one ? (one.endsWith("/") ? one : `${one} `) : shared(hit);
    if (sure.length > stem.length) return edit(`${base ? `${base} ` : ""}${lead}${sure}`);
    print({ lead: `${PROMPT} `, text: value, tone: "input" }, { text: hit.join("  "), tone: "dim" });
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    const el = e.currentTarget;
    const k = e.key;
    const ctrl = e.ctrlKey && !e.metaKey && !e.altKey;
    const at = el.selectionStart ?? value.length;
    if (k === "Tab") {
      e.preventDefault();
      complete();
    } else if (k === "ArrowUp") {
      e.preventDefault();
      const h = history.current;
      if (hIndex.current + 1 >= h.length) return;
      if (hIndex.current < 0) draft.current = value;
      hIndex.current += 1;
      edit(h[hIndex.current]);
    } else if (k === "ArrowDown") {
      e.preventDefault();
      if (hIndex.current < 0) return;
      hIndex.current -= 1;
      edit(hIndex.current < 0 ? draft.current : history.current[hIndex.current]);
    } else if (k === "PageUp" || k === "PageDown") {
      e.preventDefault();
      const out = outRef.current;
      out?.scrollBy({ top: (k === "PageUp" ? -0.9 : 0.9) * out.clientHeight });
    } else if (ctrl && k === "c") {
      // with something selected it copies, as everywhere else
      if (el.selectionStart !== el.selectionEnd) return;
      e.preventDefault();
      hIndex.current = -1;
      if (vim) print({ text: "Type  :qa  and press <Enter> to exit Vim", tone: "dim" });
      else print({ lead: `${PROMPT} `, text: `${value}^C`, tone: "input" });
      edit("");
    } else if (ctrl && k === "l") {
      e.preventDefault();
      setLines([]);
    } else if (ctrl && k === "u") {
      e.preventDefault();
      edit(value.slice(at), 0);
    } else if (ctrl && k === "a") {
      e.preventDefault();
      edit(value, 0);
    } else if (ctrl && k === "e") {
      e.preventDefault();
      edit(value);
    } else if (ctrl && k === "d") {
      e.preventDefault();
      if (value) edit(value.slice(0, at) + value.slice(at + 1), at);
      else if (!vim) {
        print({ lead: `${PROMPT} `, text: "exit", tone: "input" });
        toggle(false);
      }
    }
  };

  if (!open) return null;

  // the line as a terminal draws it: the block sits on the character under the caret
  const from = Math.min(caret.s, value.length);
  const to = Math.min(Math.max(caret.e, from), value.length);
  const picked = value.slice(from, to);

  return (
    <div
      ref={rootRef}
      className={focused ? "sh sh-focus" : "sh"}
      role="dialog"
      aria-modal="false"
      aria-label="shell"
      onClick={(e) => {
        // a click focuses the line, unless it ended a selection to copy
        if ((e.target as HTMLElement).closest("button")) return;
        if (window.getSelection()?.toString()) return;
        inputRef.current?.focus({ preventScroll: true });
      }}
    >
      <div className="sh-bar">
        <span className="sh-title">{titleAt(cwd)}</span>
        <span className="sh-size" aria-hidden="true">
          {size}
        </span>
        <button type="button" className="sh-x" onClick={() => toggle(false)} aria-label="close the shell">
          [ exit ]
        </button>
      </div>
      <div ref={outRef} className="sh-out" data-lenis-prevent>
        <div className="sh-log" aria-live="polite">
          {lines.map((l, i) => (
            <p key={i} className={l.tone ? `sh-${l.tone}` : undefined}>
              {l.lead ? <span className="sh-accent">{l.lead}</span> : null}
              {l.parts
                ? l.parts.map((part, j) => (
                    <span key={j} className={part.tone ? `sh-${part.tone}` : undefined}>
                      {part.text}
                    </span>
                  ))
                : l.text}
            </p>
          ))}
        </div>
        {game ? (
          <pre ref={gameRef} className="sh-game" aria-label="snake" />
        ) : (
          <form
            className="sh-in"
            onSubmit={(e) => {
              e.preventDefault();
              run(value);
              hIndex.current = -1;
              draft.current = "";
              edit("");
            }}
          >
            <label htmlFor="sh-input" className="sh-prompt">
              {vim ? ":" : `${PROMPT} `}
            </label>
            <span className="sh-line" aria-hidden="true">
              {value.slice(0, from)}
              {picked ? (
                <span className="sh-sel">{picked}</span>
              ) : (
                // a new key restarts the blink, so the block stays lit while typing
                <span key={`${value}|${from}`} className="sh-cur">
                  {value[from] ?? " "}
                </span>
              )}
              {value.slice(picked ? to : from + 1)}
            </span>
            <input
              id="sh-input"
              ref={inputRef}
              className="sh-field"
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                sync();
              }}
              onSelect={sync}
              onKeyDown={onKeyDown}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="go"
            />
          </form>
        )}
      </div>
    </div>
  );
}
