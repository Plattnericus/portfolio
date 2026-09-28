"use client";

import { useState, type FocusEvent, type PointerEvent } from "react";
import { ArrowUpRight, CodeXml } from "lucide-react";
import PillInner from "@/components/ui/PillInner";
import type { Project } from "@/lib/projects";
import { siteConfig } from "@/lib/site";
import ProjectPreview, { type PreviewMode } from "./ProjectPreview";

/** The chip on a card's clip: where the project is running. */
function liveLabel(url: string | null) {
  if (!url) return null;
  return url.includes("modrinth.com") ? "On Modrinth" : "Live";
}

/**
 * One project in the row: the clip, its name, and two buttons — the live
 * site and the source on GitHub. Hovering (or tabbing to) a button previews
 * where it leads right on the clip: "Source code" scans the footage into
 * glyphs and types out the repo, "Live demo" types out the address.
 *
 * The clip itself stays a mouse-only shortcut to the live site (the cursor
 * says "Open" over it); keyboards and screen readers get the two buttons.
 */
export default function ProjectCard({ project, index }: { project: Project; index: number }) {
  const [mode, setMode] = useState<PreviewMode>(null);
  const { liveUrl, githubUrl } = project;
  const onModrinth = liveUrl?.includes("modrinth.com") ?? false;

  /* A mouse previews on hover. Touch has no hover, so there the preview
     shows while a finger is down on the button — a press you hold, or the
     moment of a tap — and goes as soon as it lifts or the page scrolls. */
  const hover = (next: PreviewMode) => (event: PointerEvent) => {
    if (event.pointerType !== "touch") setMode(next);
  };
  const press = (next: PreviewMode) => (event: PointerEvent) => {
    if (event.pointerType === "touch") setMode(next);
  };
  const lift = (event: PointerEvent) => {
    if (event.pointerType === "touch") setMode(null);
  };
  const focus = (next: PreviewMode) => (event: FocusEvent<HTMLElement>) => {
    if (event.currentTarget.matches(":focus-visible")) setMode(next);
  };
  const clear = () => setMode(null);

  return (
    <div className="showcase-card">
      <div className="sc-visual" data-cursor="Open">
        <ProjectPreview
          preview={project.preview}
          name={project.name}
          eyebrow={project.eyebrow}
          status={liveLabel(liveUrl)}
          liveUrl={liveUrl}
          githubUrl={githubUrl}
          mode={mode}
        />
        <a
          className="sc-link"
          href={liveUrl ?? githubUrl ?? siteConfig.github}
          target="_blank"
          rel="noreferrer"
          tabIndex={-1}
          aria-hidden="true"
        />
      </div>

      <span className="sc-meta">
        <span className="sc-name">
          <span className="sc-index" aria-hidden="true">
            {String(index + 1).padStart(2, "0")}
          </span>
          {project.name}
        </span>
        <span className="sc-kind">
          {project.eyebrow} · {project.tech.slice(0, 3).join(" · ")}
        </span>
      </span>

      <div className="sc-actions">
        {liveUrl && (
          <a
            className="pill sc-btn sc-btn--live"
            href={liveUrl}
            target="_blank"
            rel="noreferrer"
            aria-label={`${project.name} — ${onModrinth ? "on Modrinth" : "live demo"}`}
            onPointerEnter={hover("live")}
            onPointerDown={press("live")}
            onPointerLeave={clear}
            onPointerUp={lift}
            onPointerCancel={clear}
            onFocus={focus("live")}
            onBlur={clear}
          >
            <PillInner icon={ArrowUpRight} label={onModrinth ? "Modrinth" : "Live demo"} roll="diag" />
          </a>
        )}
        {githubUrl && (
          <a
            className="pill sc-btn sc-btn--code"
            href={githubUrl}
            target="_blank"
            rel="noreferrer"
            aria-label={`${project.name} — source code on GitHub`}
            onPointerEnter={hover("code")}
            onPointerDown={press("code")}
            onPointerLeave={clear}
            onPointerUp={lift}
            onPointerCancel={clear}
            onFocus={focus("code")}
            onBlur={clear}
          >
            <PillInner icon={CodeXml} label="Source code" />
          </a>
        )}
      </div>
    </div>
  );
}
