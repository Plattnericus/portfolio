"use client";

import { useEffect, useRef, useState } from "react";
import { VideoAscii, type Picture } from "@/lib/ascii/video-ascii";
import { family } from "@/lib/fonts";
import { onFrame } from "@/lib/loop";
import { getLenis } from "@/lib/motion";
import { CINEMA_EVENT, markSecret, type CinemaSource } from "@/lib/secrets";
import { projects } from "@/lib/site";
import { worldState } from "@/lib/world/state";

const SIZES = [5, 6, 7, 8, 10, 12, 14];
const REEL_SECONDS = 7;

/**
 * Hidden. A full-screen ASCII cinema for the camera (the "mirror"), every
 * project clip in a row (the "reel") or any picture or video dropped on the
 * page. Everything is read and drawn in this tab; nothing is uploaded or kept.
 */
export default function Cinema() {
  const [source, setSource] = useState<CinemaSource | null>(null);
  const [dragging, setDragging] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labelRef = useRef<HTMLParagraphElement>(null);
  const noteRef = useRef<HTMLSpanElement>(null);

  // open requests from the shell, and files dropped anywhere
  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<CinemaSource>).detail;
      if (detail) setSource(detail);
    };
    let depth = 0;
    const hasFile = (e: DragEvent) => !!e.dataTransfer && Array.from(e.dataTransfer.types).includes("Files");
    const onEnter = (e: DragEvent) => {
      if (!hasFile(e)) return;
      depth++;
      setDragging(true);
    };
    const onLeave = (e: DragEvent) => {
      if (!hasFile(e)) return;
      depth = Math.max(0, depth - 1);
      if (!depth) setDragging(false);
    };
    const onOver = (e: DragEvent) => {
      if (hasFile(e)) e.preventDefault();
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFile(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      const file = Array.from(e.dataTransfer?.files ?? []).find((f) => /^(image|video)\//.test(f.type));
      if (!file) return;
      markSecret("drop");
      setSource({ kind: "file", file });
    };
    window.addEventListener(CINEMA_EVENT, onOpen);
    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("dragover", onOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener(CINEMA_EVENT, onOpen);
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("drop", onDrop);
    };
  }, []);

  // the screening
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!source || !canvas) return;
    getLenis()?.stop();
    worldState.covered++;
    const film = new VideoAscii(canvas, family("mono"), 8);
    let sizeIndex = window.innerWidth < 700 ? 1 : 3;
    let picture: Picture | null = null;
    let stream: MediaStream | null = null;
    let url: string | null = null;
    let video: HTMLVideoElement | null = null;
    let reelIndex = 0;
    let reelStart = 0;
    let alive = true;
    const setLabel = (t: string) => {
      if (labelRef.current) labelRef.current.textContent = t;
    };
    const setNote = (t: string) => {
      if (noteRef.current) noteRef.current.textContent = t;
    };

    const size = () => {
      film.gc.setFontSize(SIZES[sizeIndex]);
      film.resize(window.innerWidth, window.innerHeight);
    };
    size();

    const makeVideo = () => {
      const v = document.createElement("video");
      v.muted = true;
      v.playsInline = true;
      v.loop = source.kind !== "reel";
      v.autoplay = true;
      return v;
    };

    const playReel = (i: number) => {
      reelIndex = (i + projects.length) % projects.length;
      const p = projects[reelIndex];
      if (!video) return;
      video.src = p.clip;
      video.play().catch(() => undefined);
      reelStart = performance.now();
      film.cut();
      setLabel(`reel  ${String(reelIndex + 1).padStart(2, "0")} / ${String(projects.length).padStart(2, "0")}  ${p.name}`);
    };

    if (source.kind === "camera") {
      markSecret("mirror");
      film.mirror = true;
      setLabel("mirror");
      setNote("the camera picture stays in this tab. nothing is recorded or sent.");
      video = makeVideo();
      picture = video;
      navigator.mediaDevices
        ?.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }, audio: false })
        .then((s) => {
          if (!alive) {
            s.getTracks().forEach((t) => t.stop());
            return;
          }
          stream = s;
          if (video) {
            video.srcObject = s;
            video.play().catch(() => undefined);
          }
        })
        .catch(() => setNote("no camera, or no permission. nothing happened."));
      if (!navigator.mediaDevices) setNote("this browser has no camera access here.");
    } else if (source.kind === "reel") {
      markSecret("reel");
      setNote("left / right to skip");
      video = makeVideo();
      video.addEventListener("ended", () => playReel(reelIndex + 1));
      picture = video;
      playReel(0);
    } else {
      url = URL.createObjectURL(source.file);
      setLabel(source.file.name.toLowerCase());
      setNote("read locally. never uploaded.");
      if (source.file.type.startsWith("video/")) {
        video = makeVideo();
        video.src = url;
        video.play().catch(() => undefined);
        picture = video;
      } else {
        const img = new Image();
        img.src = url;
        picture = img;
      }
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSource(null);
      else if (e.key === "+" || e.key === "=") {
        sizeIndex = Math.max(0, sizeIndex - 1);
        size();
      } else if (e.key === "-") {
        sizeIndex = Math.min(SIZES.length - 1, sizeIndex + 1);
        size();
      } else if (e.key === "c") film.colour = film.colour > 0.5 ? 0 : 1;
      else if (source.kind === "reel" && e.key === "ArrowRight") playReel(reelIndex + 1);
      else if (source.kind === "reel" && e.key === "ArrowLeft") playReel(reelIndex - 1);
    };
    // the wheel changes the resolution: finer or coarser characters
    let wheel = 0;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      wheel += e.deltaY;
      if (Math.abs(wheel) < 60) return;
      sizeIndex = Math.min(SIZES.length - 1, Math.max(0, sizeIndex + Math.sign(wheel)));
      wheel = 0;
      size();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", size);
    canvas.addEventListener("wheel", onWheel, { passive: false });

    const off = onFrame((t) => {
      if (source.kind === "reel" && performance.now() - reelStart > REEL_SECONDS * 1000) playReel(reelIndex + 1);
      film.render(picture, t);
    });

    return () => {
      alive = false;
      off();
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", size);
      canvas.removeEventListener("wheel", onWheel);
      stream?.getTracks().forEach((tr) => tr.stop());
      if (video) {
        video.pause();
        video.srcObject = null;
        video.removeAttribute("src");
        video.load();
      }
      if (url) URL.revokeObjectURL(url);
      worldState.covered = Math.max(0, worldState.covered - 1);
      getLenis()?.start();
    };
  }, [source]);

  return (
    <>
      {dragging && !source ? (
        <div className="cn-drop" aria-hidden="true">
          <p>drop it. it turns into characters.</p>
        </div>
      ) : null}
      {source ? (
        <div className="cn" role="dialog" aria-modal="true" aria-label="ASCII cinema">
          <canvas ref={canvasRef} className="cn-canvas" aria-hidden="true" />
          <p ref={labelRef} className="cn-label" />
          <div className="cn-foot">
            <span ref={noteRef} className="muted" />
            <span className="muted cn-keys">wheel or + / - resolution, c colour</span>
            <button type="button" className="tl" onClick={() => setSource(null)} autoFocus>
              <span>close</span>
              <span className="arrow">esc</span>
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
