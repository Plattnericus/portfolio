"use client";

import { useEffect, useRef } from "react";
import { AsciiTitle } from "@/lib/ascii/ascii-title";
import { glyphTotal } from "@/lib/ascii/stats";
import { family, fontsReady } from "@/lib/fonts";
import { onFrame, pointer, prefersReducedMotion, watchVisible } from "@/lib/loop";
import { scrollToTarget } from "@/lib/motion";
import { bindHoverScramble } from "@/lib/scramble";
import { seasonOf } from "@/lib/seasons";
import { FOUND_EVENT, SECRETS, SHELL_EVENT, foundSecrets, markSecret } from "@/lib/secrets";
import { site } from "@/lib/site";
import { SECRET_EVENT } from "@/components/Secret";

const MARK = ["#3a2a22", "#6b4a3a", "#a8735a", "#e6a27f", "#ffd5bd", "#fff4ec"];

function clock(ms: number) {
  const s = Math.floor(ms / 1000);
  const h = String(Math.floor(s / 3600)).padStart(2, "0");
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  return `${h}:${m}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * The end of the page: where to find me, a live status line of this very
 * tab, and the name once more, as large as the screen allows, lit by the
 * cursor.
 */
export default function Footer() {
  const root = useRef<HTMLElement>(null);
  const taps = useRef<number[]>([]);

  useEffect(() => {
    const section = root.current;
    if (!section) return;
    const reduced = prefersReducedMotion();
    const host = section.querySelector<HTMLElement>(".ft-mark");
    const up = section.querySelector<HTMLElement>("[data-uptime]");
    const cells = section.querySelector<HTMLElement>("[data-cells]");
    const fpsEl = section.querySelector<HTMLElement>("[data-fps]");
    const found = section.querySelector<HTMLElement>("[data-found]");
    const season = section.querySelector<HTMLElement>("[data-season]");
    const offs: (() => void)[] = [bindHoverScramble(section)];
    const born = performance.now();
    let mark: AsciiTitle | null = null;
    let visible = false;
    let alive = true;
    let fps = 0;
    let lastFrame = 0;
    let lastText = 0;
    let lastPx = -1;
    let lastPy = -1;

    if (season) season.textContent = seasonOf().season;
    const showFound = () => {
      if (found) found.textContent = `${foundSecrets().length}/${SECRETS.length}`;
    };
    showFound();
    window.addEventListener(FOUND_EVENT, showFound);
    offs.push(() => window.removeEventListener(FOUND_EVENT, showFound));

    offs.push(watchVisible(section, (v) => (visible = v), "0px"));

    fontsReady().then(() => {
      if (!alive || !host) return;
      mark = new AsciiTitle(host, {
        fontFamily: family("mono"),
        displayFamily: family("display"),
        palette: MARK,
        maxCell: 11,
        label: false,
        reveal: "rain",
      });
      let shown = false;
      offs.push(
        watchVisible(
          host,
          (v) => {
            if (v && !shown) {
              shown = true;
              mark?.set(site.name, !reduced);
            }
          },
          "0px 0px -15% 0px",
        ),
      );
    });

    offs.push(
      onFrame((_t, dms) => {
        if (!visible) return;
        // the status line, a few times a second
        if (dms > 0) fps += (1000 / dms - fps) * 0.05;
        const now = performance.now();
        if (now - lastText > 250) {
          lastText = now;
          if (up) up.textContent = clock(now - born);
          if (cells) cells.textContent = Math.round(glyphTotal()).toLocaleString("en-US");
          if (fpsEl) fpsEl.textContent = String(Math.round(fps));
        }
        // the name is lit from wherever the cursor is
        if (mark && host && pointer.moved && !reduced && now - lastFrame > 16) {
          const r = host.getBoundingClientRect();
          const px = pointer.sx - r.left;
          const py = pointer.sy - r.top;
          if (Math.abs(px - lastPx) + Math.abs(py - lastPy) > 1.5) {
            lastPx = px;
            lastPy = py;
            lastFrame = now;
            mark.setLight({ x: px, y: py });
          }
        }
      }),
    );

    // a click and the letters fall down; another and they stand back up
    const onClick = () => {
      if (!mark || reduced) return;
      if (!mark.collapsed) markSecret("gravity");
      mark.toggleCollapse();
    };
    host?.addEventListener("click", onClick);
    offs.push(() => host?.removeEventListener("click", onClick));

    return () => {
      alive = false;
      offs.forEach((f) => f());
      mark?.destroy();
    };
  }, []);

  return (
    <footer ref={root} id="footer" className="ft" data-section="footer">
      <div className="ft-cols" data-quiet>
        <div className="ft-col">
          <p className="ft-path">~/contact</p>
          <a href={`mailto:${site.email}`} className="tl" data-scramble>
            <span data-label>{site.email}</span>
          </a>
        </div>
        <div className="ft-col">
          <p className="ft-path">~/elsewhere</p>
          <a className="tl" href={site.github} target="_blank" rel="noreferrer" data-scramble>
            <span data-label>github</span>
            <span className="arrow">↗</span>
          </a>
          <a className="tl" href={site.modrinth} target="_blank" rel="noreferrer" data-scramble>
            <span data-label>modrinth</span>
            <span className="arrow">↗</span>
          </a>
        </div>
        <div className="ft-col">
          <p className="ft-path">~/site</p>
          <a className="tl" href="/privacy" data-scramble>
            <span data-label>privacy</span>
          </a>
          <a className="tl" href="/llms.txt" data-scramble>
            <span data-label>llms.txt</span>
          </a>
          <a className="tl" href="/.well-known/security.txt" data-scramble>
            <span data-label>security.txt</span>
          </a>
        </div>
        <div className="ft-col">
          <p className="ft-path">~/shell</p>
          <button type="button" className="tl ft-shell" onClick={() => window.dispatchEvent(new Event(SHELL_EVENT))}>
            <span>press ` </span>
          </button>
          <button
            type="button"
            className="ft-hint"
            onClick={() => {
              // five taps in a row: the way in for phones without a keyboard
              const now = performance.now();
              taps.current = [...taps.current.filter((t) => now - t < 2500), now];
              if (taps.current.length >= 5) {
                taps.current = [];
                window.dispatchEvent(new Event(SECRET_EVENT));
              }
            }}
          >
            something unlocks here every season
          </button>
        </div>
      </div>

      <p className="ft-status muted" aria-hidden="true">
        <span>
          up <b data-uptime>00:00:00</b>
        </span>
        <span>
          <b data-cells>0</b> cells drawn
        </span>
        <span>
          <b data-fps>0</b> fps
        </span>
        <span>
          season <b data-season>-</b>
        </span>
        <span>
          secrets <b data-found>0/0</b>
        </span>
      </p>

      <div className="ft-mark" aria-hidden="true" />

      <div className="ft-base">
        <span className="muted">© {new Date().getFullYear()} {site.name.toLowerCase()} / {site.handle.toLowerCase()}</span>
        <a
          href="#hero"
          className="tl"
          data-scramble
          onClick={(e) => {
            e.preventDefault();
            scrollToTarget(0, 4);
          }}
        >
          <span data-label>back to the stars</span>
          <span className="arrow">↑</span>
        </a>
      </div>
    </footer>
  );
}
