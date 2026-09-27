"use client";

import { ArrowUpRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useSmoothScroll } from "@/components/providers/SmoothScrollProvider";
import type { ProjectPreview as ProjectPreviewData } from "@/lib/projects";

/** Two extra goes after the first failure, spaced far enough apart to ride out
    a brief drop rather than hammering a server that's already struggling. */
const RETRY_LIMIT = 2;
const RETRY_BACKOFF_MS = 900;

/** How far ahead of the viewport a card starts fetching its clip: two screens
    is enough for every clip to be decoded long before it scrolls into view,
    without a phone pulling every video the moment the page opens. */
const LOAD_AHEAD = "200% 0px 200% 0px";

/** A failed media request is usually a blip — a dropped connection, a proxy
    hiccup, an extension racing the request. Re-requesting the identical URL
    can simply be answered from the browser's cached failure, so every retry
    carries a marker that forces a genuinely new fetch. */
function withAttempt(src: string, attempt: number) {
  if (attempt === 0) return src;
  return `${src}${src.includes("?") ? "&" : "?"}reload=${attempt}`;
}

type ProjectPreviewProps = {
  preview: ProjectPreviewData;
  name: string;
  eyebrow: string;
  /** chip in the clip's corner ("Live", "On Modrinth"), if it runs anywhere */
  status?: string | null;
};

export default function ProjectPreview({
  preview,
  name,
  eyebrow,
  status,
}: ProjectPreviewProps) {
  const rootRef = useRef<HTMLSpanElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const { introDone } = useSmoothScroll();
  const [near, setNear] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [videoAttempt, setVideoAttempt] = useState(0);
  const retryTimer = useRef(0);

  /* Nothing is fetched until the intro has finished — the NEXOR intro, its
     fonts and the page's own code get the connection to themselves first —
     and then only once the card is within LOAD_AHEAD of the viewport. */
  const shouldLoad = introDone && near;

  useEffect(() => () => window.clearTimeout(retryTimer.current), []);

  const handleVideoError = () => {
    if (videoAttempt >= RETRY_LIMIT) return;
    window.clearTimeout(retryTimer.current);
    retryTimer.current = window.setTimeout(
      () => setVideoAttempt((attempt) => attempt + 1),
      RETRY_BACKOFF_MS,
    );
  };

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    if (!("IntersectionObserver" in window)) {
      const raf = requestAnimationFrame(() => {
        setNear(true);
        setIsActive(true);
      });
      return () => cancelAnimationFrame(raf);
    }

    const nearObserver = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNear(true);
          nearObserver.disconnect();
        }
      },
      { rootMargin: LOAD_AHEAD },
    );
    /* isActive only pauses playback for off-screen cards to save CPU/battery */
    const activityObserver = new IntersectionObserver(
      (entries) => setIsActive(entries.some((entry) => entry.isIntersecting)),
      { threshold: 0.08 },
    );
    nearObserver.observe(root);
    activityObserver.observe(root);

    return () => {
      nearObserver.disconnect();
      activityObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !shouldLoad) return;

    if (!isActive) {
      video.pause();
      return;
    }

    void video.play().catch(() => {
      /* A browser that blocks autoplay just leaves the card on its first
         decoded frame. */
    });
  }, [isActive, shouldLoad, videoAttempt]);

  const objectPosition = preview.objectPosition ?? "center center";

  return (
    <span
      className="sc-frame"
      ref={rootRef}
      role="img"
      aria-label={`${name} — ${eyebrow} preview`}
    >
      {/* no autoPlay: playback is driven by isActive above, so a clip that
          finishes loading while its card is off-screen doesn't start playing */}
      <video
        className="sc-media sc-video"
        ref={videoRef}
        src={shouldLoad ? withAttempt(preview.src, videoAttempt) : undefined}
        muted
        loop
        playsInline
        preload={shouldLoad ? "auto" : "none"}
        aria-hidden="true"
        style={{ objectPosition }}
        onError={handleVideoError}
      />

      {status && (
        <span className="sc-live" aria-hidden="true">
          <span className="sc-live-dot" />
          {status}
        </span>
      )}

      <span className="sc-arrow" aria-hidden="true">
        <ArrowUpRight />
      </span>
    </span>
  );
}
