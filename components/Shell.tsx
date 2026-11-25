"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { getLenis, scrollToTarget } from "@/lib/motion";
import { SECRETS, SHELL_EVENT, SPECIMEN_EVENT, foundSecrets, markSecret, openCinema, SEASONS_EVENT } from "@/lib/secrets";
import { SEASONS, WEATHER, chooseSeason, type Season } from "@/lib/seasons";
import { setMuted } from "@/lib/sound";
import { projects, quotes, site, skills } from "@/lib/site";
import { Snake } from "@/lib/snake";
import { N_MARK } from "@/lib/ascii/glyphs";
import { glyphTotal } from "@/lib/ascii/stats";
import { worldState } from "@/lib/world/state";

type Line = { text: string; tone?: "dim" | "accent" | "input"; lead?: string };

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

const PROMPT = `${site.name.toLowerCase()}@${site.handle.toLowerCase()}:~$`;

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
  ["ls", "list the projects"],
  ["open <n>", "open a project"],
  ["cd <section>", "fly to about, tools, work, projects, contact"],
  ["stack", "what I build with"],
  ["whoami", "who this is"],
  ["mail", "write me"],
  ["warp", "full speed"],
  ["secrets", "how many you found"],
  ["mute", "no chime for a found secret (unmute)"],
  ["clear", "clear the screen"],
  ["exit", "close the shell (esc)"],
];

const COMMANDS = [...PUBLIC.map(([c]) => c.split(" ")[0]), "help"];

function findProject(arg: string) {
  const n = Number(arg);
  if (Number.isInteger(n) && n >= 1 && n <= projects.length) return projects[n - 1];
  const a = arg.toLowerCase().replace(/[\s_-]+/g, "");
  return projects.find(
    (p) => p.slug.replace(/[\s_-]+/g, "").startsWith(a) || p.name.toLowerCase().replace(/[\s_-]+/g, "").startsWith(a),
  );
}

/**
 * A small shell over the page: ` or ctrl/cmd + k. It lists and opens the
 * projects, flies the camera around, and knows a few things it does not
 * advertise.
 */
export default function Shell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [value, setValue] = useState("");
  const history = useRef<string[]>([]);
  const hIndex = useRef(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const outRef = useRef<HTMLDivElement>(null);
  const greeted = useRef(false);
  const [game, setGame] = useState(false);
  // inside the editor every line is an ex command until it is left
  const [vim, setVim] = useState(false);
  const gameRef = useRef<HTMLPreElement>(null);

  const print = useCallback((...add: Line[]) => setLines((l) => [...l, ...add].slice(-200)), []);

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

  // ` and ctrl/cmd + k open it anywhere; esc closes
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
    inputRef.current?.focus();
    return () => getLenis()?.start();
  }, [open]);

  useEffect(() => {
    const out = outRef.current;
    if (out) out.scrollTop = out.scrollHeight;
  }, [lines, game]);

  // snake: the board takes the keys until q or esc
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
      setTimeout(() => inputRef.current?.focus(), 0);
    };
    const onKey = (e: KeyboardEvent) => {
      // the shell's own key closes it as usual, the game ends with it
      if (e.key === "`") return quit();
      if (e.key === "q" || e.key === "Escape") quit();
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

  const run = (raw: string) => {
    const cmdline = raw.trim();
    if (vim) {
      print({ text: `:${cmdline.replace(/^:/, "")}`, tone: "input" });
      if (/^:?(q!?|wq!?|x|qa!?)$/.test(cmdline)) {
        setVim(false);
        markSecret("vim");
        print({ text: "you got out. most people don't.", tone: "accent" });
      } else if (cmdline) {
        print({ text: `E492: Not an editor command: ${cmdline.replace(/^:/, "")}`, tone: "dim" });
      }
      return;
    }
    print({ text: `${PROMPT} ${cmdline}`, tone: "input" });
    if (!cmdline) return;
    history.current = [cmdline, ...history.current.filter((h) => h !== cmdline)].slice(0, 50);
    hIndex.current = -1;
    const [cmd, ...rest] = cmdline.split(/\s+/);
    const arg = rest.join(" ");
    const c = cmd.toLowerCase();

    if (c === "help") {
      print(...PUBLIC.map(([k, v]) => ({ text: `  ${k.padEnd(14)}${v}` })));
    } else if (c === "ls" && /-\w*a/.test(arg)) {
      print({ text: "  .plan", tone: "accent" }, ...projects.map((p) => ({ text: `  ${p.slug}` })));
    } else if (c === "cat" && arg.replace(/^\.\//, "") === ".plan") {
      markSecret("dotfile");
      print(
        { text: "  build things that run." },
        { text: "  keep them fast, keep them locked." },
        { text: `  ${foundSecrets().length} of ${SECRETS.length} secrets found so far.`, tone: "dim" },
      );
    } else if (c === "cat") {
      print({ text: arg ? `cat: ${arg}: no such file` : "cat: which file?", tone: "dim" });
    } else if (c === "fc-list") {
      print({ text: "app/fonts/NexorGrid.woff: Nexor Grid:style=Regular" });
      toggle(false);
      window.dispatchEvent(new Event(SPECIMEN_EVENT));
    } else if (c === "ls") {
      print(
        ...projects.map((p, i) => ({
          text: `  ${String(i + 1).padStart(2, "0")}  ${p.name.toLowerCase().padEnd(20)}${p.kind}`,
        })),
      );
    } else if (c === "open") {
      const p = arg ? findProject(arg) : undefined;
      if (!p) print({ text: arg ? `open: no project "${arg}". try ls` : "open: which one? try open 1", tone: "dim" });
      else {
        const href = p.live?.href ?? p.source;
        print({ text: `opening ${href}`, tone: "accent" });
        window.open(href, "_blank", "noopener,noreferrer");
      }
    } else if (c === "cd") {
      const a = arg.toLowerCase();
      if (a === "/dev/null" || a === "/dev/null/") {
        markSecret("singularity");
        print({ text: "falling...", tone: "accent" });
        setTimeout(() => router.push("/dev/null"), 500);
        return;
      }
      const target = SECTIONS[a || "~"];
      if (!target) print({ text: `cd: no such section: ${arg}`, tone: "dim" });
      else {
        toggle(false);
        setTimeout(() => scrollToTarget(target, 3), 60);
      }
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
    } else if (c === "exit" || c === "q" || c === "quit") {
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
      print({ text: `command not found: ${cmd}. try help`, tone: "dim" });
    }
  };

  const complete = () => {
    const parts = value.split(" ");
    if (parts.length === 1) {
      const hit = COMMANDS.filter((c) => c.startsWith(parts[0].toLowerCase()));
      if (hit.length === 1) setValue(`${hit[0]} `);
      else if (hit.length > 1) print({ text: hit.join("  "), tone: "dim" });
    } else if (parts[0] === "open") {
      const p = findProject(parts.slice(1).join(" "));
      if (p) setValue(`open ${p.slug}`);
    } else if (parts[0] === "cd") {
      const hit = Object.keys(SECTIONS).filter((s) => s.startsWith(parts[1] ?? ""));
      if (hit.length === 1) setValue(`cd ${hit[0]}`);
    }
  };

  if (!open) return null;

  return (
    <div className="sh" role="dialog" aria-modal="false" aria-label="shell" onClick={() => inputRef.current?.focus()}>
      <div ref={outRef} className="sh-out" aria-live="polite">
        {lines.map((l, i) => (
          <p key={i} className={l.tone ? `sh-${l.tone}` : undefined}>
            {l.lead ? <span className="sh-accent">{l.lead}</span> : null}
            {l.text}
          </p>
        ))}
        {game ? <pre ref={gameRef} className="sh-game" aria-label="snake" /> : null}
      </div>
      <form
        className="sh-in"
        hidden={game}
        onSubmit={(e) => {
          e.preventDefault();
          run(value);
          setValue("");
        }}
      >
        <label htmlFor="sh-input" className="sh-prompt">
          {vim ? ":" : PROMPT}
        </label>
        <input
          id="sh-input"
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Tab") {
              e.preventDefault();
              complete();
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              const h = history.current;
              hIndex.current = Math.min(h.length - 1, hIndex.current + 1);
              if (h[hIndex.current]) setValue(h[hIndex.current]);
            } else if (e.key === "ArrowDown") {
              e.preventDefault();
              hIndex.current = Math.max(-1, hIndex.current - 1);
              setValue(hIndex.current < 0 ? "" : history.current[hIndex.current]);
            } else if (e.key === "`") {
              e.preventDefault();
              toggle(false);
            }
          }}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="go"
        />
      </form>
    </div>
  );
}
