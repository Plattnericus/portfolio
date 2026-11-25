"use client";

import { useEffect, useRef } from "react";
import { AsciiTitle } from "@/lib/ascii/ascii-title";
import { VideoAscii } from "@/lib/ascii/video-ascii";
import { retryVideo } from "@/lib/retry-video";
import { hideCode, loadCode, noteRead, pickCode, showCode } from "@/lib/code-view";
import { family, fontsReady } from "@/lib/fonts";
import { onFrame, prefersReducedMotion, watchVisible } from "@/lib/loop";
import { ScrollTrigger } from "@/lib/motion";
import { bindHoverScramble, textInVaried } from "@/lib/scramble";
import { projects, site } from "@/lib/site";
import { pulse } from "@/lib/world/state";

const BAR = 32;

/**
 * Pinned. Every project plays as a large colour ASCII film; scrolling cuts
 * to the next one through a burst of character static while the camera keeps
 * flying through the stars behind. Over the source link, the screen prints
 * the project's real code instead.
 */
export default function Work() {
  const root = useRef<HTMLElement>(null);

  useEffect(() => {
    const section = root.current;
    if (!section) return;
    const reduced = prefersReducedMotion();
    const videos = Array.from(section.querySelectorAll<HTMLVideoElement>("video"));
    const screen = section.querySelector<HTMLElement>(".wk-screen");
    const canvas = section.querySelector<HTMLCanvasElement>(".wk-screen canvas");
    const nameHost = section.querySelector<HTMLElement>(".wk-name");
    const kind = section.querySelector<HTMLElement>(".wk-kind");
    const desc = section.querySelector<HTMLElement>(".wk-desc");
    const tech = section.querySelector<HTMLElement>(".wk-tech");
    const live = section.querySelector<HTMLAnchorElement>(".wk-live");
    const liveLabel = section.querySelector<HTMLElement>(".wk-live [data-label]");
    const source = section.querySelector<HTMLAnchorElement>(".wk-source");
    const num = section.querySelector<HTMLElement>(".wk-num b");
    const time = section.querySelector<HTMLElement>(".wk-bar");
    const played = time?.querySelector<HTMLElement>("b");
    const rest = time?.querySelector<HTMLElement>("i");
    const file = section.querySelector<HTMLElement>(".wk-file");
    const code = section.querySelector<HTMLElement>(".wk-screen .code");
    let reading = false;
    let lastBar = -1;
    const offs: (() => void)[] = [bindHoverScramble(section)];
    let title: AsciiTitle | null = null;
    let film: VideoAscii | null = null;
    let active = -1;
    let visible = false;
    let alive = true;

    const load = (i: number) => {
      const v = videos[i];
      if (v && !v.src) v.src = v.dataset.src ?? "";
    };
    videos.forEach((v, k) =>
      offs.push(
        retryVideo(v, () => {
          if (k === active && visible) v.play().catch(() => undefined);
        }),
      ),
    );

    const setActive = (i: number) => {
      if (i === active) return;
      const first = active === -1;
      active = i;
      const p = projects[i];
      [i - 1, i, i + 1].forEach((k) => k >= 0 && k < videos.length && load(k));
      videos.forEach((v, k) => {
        if (k === i && visible) v.play().catch(() => undefined);
        else v.pause();
      });
      if (!first && !reduced) film?.cut();
      if (!first && !reduced) pulse(0.3, 0.5, 1);
      if (num) num.textContent = String(i + 1).padStart(2, "0");
      if (reading && code) hideCode(code);
      reading = false;
      if (file) file.textContent = p.clip.split("/").pop() ?? "";
      lastBar = -1;
      title?.set(p.name);
      if (kind) textInVaried(kind, { text: p.kind, duration: 0.6 });
      if (desc) textInVaried(desc, { text: p.description, duration: 0.9, spread: 0.85 });
      if (tech) tech.textContent = p.tech.join(" / ");
      if (live) {
        live.hidden = !p.live;
        if (p.live) live.href = p.live.href;
        if (liveLabel && p.live) {
          liveLabel.textContent = p.live.label;
          liveLabel.dataset.text = p.live.label;
        }
      }
      if (source) {
        source.href = p.source;
        source.setAttribute("aria-label", `source: ${p.name}`);
      }
    };

    // the source link: the screen prints the code of the project on show
    let over = false;
    const read = async () => {
      over = true;
      const p = projects[active];
      if (!p || !code) return;
      const snip = await pickCode(p.slug);
      if (!snip) return;
      // asking for it counts as reading it, even if the cursor moved on first
      noteRead(p.slug);
      if (!over || projects[active] !== p) return;
      reading = true;
      showCode(code, snip);
      if (file) file.textContent = `${snip.path.split("/").pop()}:${snip.start}`;
    };
    const unread = () => {
      over = false;
      if (!reading || !code) return;
      reading = false;
      hideCode(code);
      if (file) file.textContent = projects[active]?.clip.split("/").pop() ?? "";
    };
    if (source && !reduced) {
      source.addEventListener("pointerenter", read);
      source.addEventListener("focus", read);
      source.addEventListener("pointerleave", unread);
      source.addEventListener("blur", unread);
      offs.push(() => {
        source.removeEventListener("pointerenter", read);
        source.removeEventListener("focus", read);
        source.removeEventListener("pointerleave", unread);
        source.removeEventListener("blur", unread);
      });
    }

    const size = () => {
      if (!film || !screen) return;
      const w = screen.clientWidth;
      film.gc.setFontSize(w < 520 ? 5 : w < 900 ? 6 : 7);
      film.resize(w, screen.clientHeight);
    };

    let st: ScrollTrigger | null = null;
    fontsReady().then(() => {
      if (!alive || !canvas || !nameHost) return;
      title = new AsciiTitle(nameHost, {
        fontFamily: family("mono"),
        displayFamily: family("display"),
        knockout: site.colors.bg,
        label: false,
        reveal: "vary",
      });
      film = new VideoAscii(canvas, family("mono"), 8);
      film.frame = true;
      size();
      const ro = new ResizeObserver(size);
      if (screen) ro.observe(screen);
      offs.push(() => ro.disconnect());
      offs.push(
        onFrame((t) => {
          if (!visible || !film) return;
          const v = videos[active];
          film.render(v ?? null, t);
          // a timeline under the film, in characters
          if (time && v && v.duration) {
            const k = v.currentTime / v.duration;
            const bar = Math.round(k * BAR);
            if (bar !== lastBar) {
              lastBar = bar;
              if (played) played.textContent = "=".repeat(bar);
              if (rest) rest.textContent = "-".repeat(BAR - bar);
            }
          }
        }),
      );
      st = ScrollTrigger.create({
        trigger: section,
        start: "top 80%",
        end: "bottom bottom",
        onUpdate: () => {
          const span = section.offsetHeight - window.innerHeight;
          const p = Math.max(0, (window.scrollY - section.offsetTop) / Math.max(1, span));
          setActive(Math.min(projects.length - 1, Math.floor(p * projects.length)));
        },
      });
      setActive(0);
    });

    offs.push(
      watchVisible(
        section,
        (v) => {
          visible = v;
          if (v) loadCode();
          const cur = videos[active];
          if (!cur) return;
          if (v) cur.play().catch(() => undefined);
          else cur.pause();
        },
        "0px",
      ),
    );

    return () => {
      alive = false;
      st?.kill();
      title?.destroy();
      offs.forEach((f) => f());
      videos.forEach((v) => v.pause());
    };
  }, []);

  const first = projects[0];
  return (
    <section ref={root} id="work" className="wk" data-section="work">
      <h2 className="sr-only">Work</h2>
      <ul className="sr-only">
        {projects.map((p) => (
          <li key={p.slug}>
            <h3>{p.name}</h3>
            <p>
              {p.kind}. {p.description} Built with {p.tech.join(", ")}.
            </p>
            {p.live ? <a href={p.live.href}>{p.live.label}</a> : null}
            <a href={p.source}>source of {p.name}</a>
          </li>
        ))}
      </ul>
      {projects.map((p) => (
        <video key={p.slug} data-src={p.clip} muted loop playsInline preload="none" tabIndex={-1}>
          {/* the clips are silent; see the file */}
          <track kind="captions" src="/clips/silent.vtt" srcLang="en" label="No sound" default />
        </video>
      ))}
      <div className="wk-pin">
        <div className="wk-film" aria-hidden="true">
          <div className="wk-screen">
            <canvas />
            <div className="code" />
          </div>
          <p className="wk-meta muted">
            <span className="wk-file">{first.clip.split("/").pop()}</span>
            <span className="wk-bar">
              <b />
              <i>{"-".repeat(BAR)}</i>
            </span>
          </p>
        </div>
        <div className="wk-copy" data-quiet>
          <p className="wk-num muted" aria-hidden="true">
            <b>01</b> / {String(projects.length).padStart(2, "0")}
          </p>
          <div className="wk-name" aria-hidden="true" />
          <p className="wk-kind accent" aria-hidden="true">
            {first.kind}
          </p>
          <p className="wk-desc" aria-hidden="true">
            {first.description}
          </p>
          <p className="wk-tech muted" aria-hidden="true">
            {first.tech.join(" / ")}
          </p>
          <div className="wk-links">
            <a className="tl wk-live" href={first.live?.href ?? "#"} target="_blank" rel="noreferrer" data-scramble>
              <span data-label>{first.live?.label}</span>
              <span className="arrow">↗</span>
            </a>
            <a
              className="tl wk-source"
              href={first.source}
              target="_blank"
              rel="noreferrer"
              data-scramble
              data-code=""
              aria-label={`source: ${first.name}`}
            >
              <span data-label>source</span>
              <span className="arrow">↗</span>
            </a>
          </div>
        </div>
        <a className="tl wk-more" href={site.github} target="_blank" rel="noreferrer" data-scramble>
          <span data-label>everything else on github</span>
          <span className="arrow">↗</span>
        </a>
      </div>
    </section>
  );
}
