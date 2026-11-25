"use client";

import { useEffect, useRef } from "react";
import AsciiHeading from "@/components/AsciiHeading";
import { VideoAscii } from "@/lib/ascii/video-ascii";
import { hideCode, loadCode, noteRead, pickCode, showCode } from "@/lib/code-view";
import { family, fontsReady } from "@/lib/fonts";
import { onFrame, prefersReducedMotion, watchVisible } from "@/lib/loop";
import { ScrollTrigger } from "@/lib/motion";
import { bindHoverScramble, scramble } from "@/lib/scramble";
import { projects } from "@/lib/site";

const fileOf = (clip: string) => clip.split("/").pop() ?? clip;

/**
 * Every project as one line of a terminal listing, with dotted leaders.
 * On wide screens with a mouse, a monitor beside the list plays the film of
 * the line under the cursor, in characters, and over [ code ] it prints the
 * real code of that project instead. It never sits over the text.
 */
export default function Index() {
  const root = useRef<HTMLElement>(null);

  useEffect(() => {
    const section = root.current;
    if (!section) return;
    const reduced = prefersReducedMotion();
    const offs: (() => void)[] = [bindHoverScramble(section)];
    const rows = Array.from(section.querySelectorAll<HTMLElement>(".ix-row"));
    rows.forEach((row, i) => {
      const name = row.querySelector<HTMLElement>(".ix-name");
      const st = ScrollTrigger.create({
        trigger: row,
        start: "top 94%",
        once: true,
        onEnter: () => {
          row.classList.add("is-in");
          if (!reduced && name) scramble(name, { duration: 0.6, delay: i * 0.04 });
        },
      });
      offs.push(() => st.kill());
    });

    const peek = section.querySelector<HTMLElement>(".ix-peek");
    const screen = section.querySelector<HTMLElement>(".ix-screen");
    const canvas = section.querySelector<HTMLCanvasElement>(".ix-screen canvas");
    const video = section.querySelector<HTMLVideoElement>(".ix-screen video");
    const num = section.querySelector<HTMLElement>(".ix-cap b");
    const file = section.querySelector<HTMLElement>(".ix-cap span");
    const code = section.querySelector<HTMLElement>(".ix-screen .code");
    // the monitor is only laid out where there is room and a mouse
    const wanted = () => !!peek && getComputedStyle(peek).display !== "none";
    if (!reduced && screen && canvas && video && peek) {
      let film: VideoAscii | null = null;
      let active = 0;
      let visible = false;
      fontsReady().then(() => {
        // fine characters: the monitor is small, the detail has to come from the cells
        film = new VideoAscii(canvas, family("mono"), 5.5);
        film.frame = true;
        film.resize(screen.offsetWidth, screen.offsetHeight);
      });
      const ro = new ResizeObserver(() => film?.resize(screen.offsetWidth, screen.offsetHeight));
      // clips open on a splash screen: start a third of the way in, where the site is
      const skipIntro = () => {
        if (video.duration && video.currentTime < 0.5) video.currentTime = video.duration * 0.33;
      };
      video.addEventListener("loadedmetadata", skipIntro);
      offs.push(() => video.removeEventListener("loadedmetadata", skipIntro));
      ro.observe(screen);
      offs.push(() => ro.disconnect());

      const play = () => {
        if (!visible || !wanted()) return;
        if (!video.src) video.src = projects[active].clip;
        video.play().catch(() => undefined);
      };
      let caption = "";
      const label = (text: string) => {
        if (!file || text === caption) return;
        caption = text;
        scramble(file, { duration: 0.4, text });
      };
      const show = (i: number) => {
        if (!wanted()) return;
        peek.classList.add("is-hot");
        if (i === active) return;
        active = i;
        video.src = projects[i].clip;
        play();
        // the next site arrives coarse and sharpens: it shows at once, never as static
        film?.cut("resolve");
        if (num) num.textContent = String(i + 1).padStart(2, "0");
        label(fileOf(projects[i].clip));
      };
      rows.forEach((row, i) => {
        const enter = () => {
          const name = row.querySelector<HTMLElement>(".ix-name");
          if (name) scramble(name, { duration: 0.45, spread: 0.9 });
          show(i);
        };
        row.addEventListener("pointerenter", enter);
        offs.push(() => row.removeEventListener("pointerenter", enter));
        // over the source link the monitor prints the code itself, a
        // different excerpt every time
        const src = row.querySelector<HTMLElement>("[data-code]");
        if (!src || !code) return;
        let over = false;
        const on = async () => {
          over = true;
          show(i);
          if (!wanted()) return;
          const snip = await pickCode(projects[i].slug);
          if (!snip || !over) return;
          showCode(code, snip);
          label(`${fileOf(snip.path)}:${snip.start}`);
          noteRead(projects[i].slug);
        };
        const off = () => {
          over = false;
          hideCode(code);
          label(fileOf(projects[i].clip));
        };
        src.addEventListener("pointerenter", on);
        src.addEventListener("focus", on);
        src.addEventListener("pointerleave", off);
        src.addEventListener("blur", off);
        offs.push(() => {
          src.removeEventListener("pointerenter", on);
          src.removeEventListener("focus", on);
          src.removeEventListener("pointerleave", off);
          src.removeEventListener("blur", off);
        });
      });
      const list = section.querySelector<HTMLElement>(".ix-list");
      const cool = () => peek.classList.remove("is-hot");
      list?.addEventListener("pointerleave", cool);
      offs.push(() => list?.removeEventListener("pointerleave", cool));

      offs.push(
        watchVisible(section, (v) => {
          visible = v;
          if (v) loadCode();
          if (v) play();
          else video.pause();
        }),
      );
      offs.push(
        onFrame((t) => {
          if (visible && film && video.src) film.render(video, t);
        }),
      );
      offs.push(() => video.pause());
    }

    return () => offs.forEach((f) => f());
  }, []);

  return (
    <section ref={root} id="index" className="ix" data-section="index">
      <AsciiHeading text="All projects" className="ix-title" reveal="dissolve" />
      <div className="ix-body">
        <ol className="ix-list" data-quiet>
          {projects.map((p, i) => (
            <li key={p.slug} className="ix-row">
              <span className="ix-i accent">{String(i + 1).padStart(2, "0")}</span>
              <span className="ix-name">{p.name}</span>
              <span className="ix-dots" aria-hidden="true" />
              <span className="ix-kind muted">{p.kind}</span>
              <span className="ix-links">
                {p.live ? (
                  <a className="tl" href={p.live.href} target="_blank" rel="noreferrer" data-scramble>
                    <span data-label>live</span>
                  </a>
                ) : null}
                <a
                  className="tl"
                  href={p.source}
                  target="_blank"
                  rel="noreferrer"
                  data-scramble
                  data-code=""
                >
                  <span data-label>code</span>
                </a>
              </span>
            </li>
          ))}
        </ol>
        <figure className="ix-peek" aria-hidden="true" data-quiet>
          <div className="ix-screen">
            <canvas />
            <video muted loop playsInline preload="none" tabIndex={-1} />
            <div className="code" />
          </div>
          <figcaption className="ix-cap muted">
            <b>01</b> <span>{fileOf(projects[0].clip)}</span>
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
