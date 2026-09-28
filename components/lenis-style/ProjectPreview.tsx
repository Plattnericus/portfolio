"use client";

import { ArrowUpRight, Lock } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useSmoothScroll } from "@/components/providers/SmoothScrollProvider";
import { NO_MOTION_PREF } from "@/lib/animation";
import type { ProjectPreview as ProjectPreviewData } from "@/lib/projects";
import { GITHUB_MARK } from "@/lib/site";
import { createAsciiScan, type AsciiScan } from "./asciiScan";

/** Two extra goes after the first failure, spaced far enough apart to ride out
    a brief drop rather than hammering a server that's already struggling. */
const RETRY_LIMIT = 2;
const RETRY_BACKOFF_MS = 900;

/** How far ahead of the viewport a card starts fetching its clip: two screens
    is enough for every clip to be decoded long before it scrolls into view,
    without a phone pulling every video the moment the page opens. */
const LOAD_AHEAD = "200% 0px 200% 0px";

/** A card starts playing a little before it slides into view, so no clip
    enters the screen standing still. */
const PLAY_AHEAD = "15% 15% 15% 15%";

/** How often a clip the browser paused on its own is started again before
    giving up (autoplay blocked for good, e.g. a phone in low power mode). */
const RESUME_LIMIT = 3;

/**
 * Chrome runs the whole display at a video's own 30 Hz as soon as two or more
 * videos play at once — it takes the page for a video call (measured on a
 * 120 Hz Mac: 121 fps with one clip, 31 with three). Clips painted into a
 * canvas don't count as videos: the <video> plays on, invisible, and every
 * frame it decodes is copied onto a canvas in its place (121 fps with four
 * clips playing, ~0.2 ms a copy). So every clip on screen can loop while the
 * page keeps its full frame rate.
 *
 * Returns the cleanup, or null where there is no requestVideoFrameCallback —
 * the video is then simply shown itself.
 */
function mirrorClip(video: HTMLVideoElement, canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d");
  if (!ctx || !("requestVideoFrameCallback" in video)) return null;
  const paint = () => {
    if (!video.videoWidth) return;
    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }
    ctx.drawImage(video, 0, 0);
  };
  let handle = 0;
  const onFrame = () => {
    paint();
    handle = video.requestVideoFrameCallback(onFrame);
  };
  handle = video.requestVideoFrameCallback(onFrame);
  /* the first frame, for a clip that hasn't started yet or can't */
  video.addEventListener("loadeddata", paint);
  video.addEventListener("seeked", paint);
  paint();
  return () => {
    video.cancelVideoFrameCallback(handle);
    video.removeEventListener("loadeddata", paint);
    video.removeEventListener("seeked", paint);
  };
}

/** A failed media request is usually a blip — a dropped connection, a proxy
    hiccup, an extension racing the request. Re-requesting the identical URL
    can simply be answered from the browser's cached failure, so every retry
    carries a marker that forces a genuinely new fetch. */
function withAttempt(src: string, attempt: number) {
  if (attempt === 0) return src;
  return `${src}${src.includes("?") ? "&" : "?"}reload=${attempt}`;
}

/** "https://github.com/bedchem/POKYH/" → "github.com/bedchem/POKYH" */
function bareUrl(url: string) {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

/** Which of the card's buttons is hovered or keyboard-focused. */
export type PreviewMode = "live" | "code" | null;

type ProjectPreviewProps = {
  preview: ProjectPreviewData;
  name: string;
  eyebrow: string;
  /** chip in the clip's corner ("Live", "On Modrinth"), if it runs anywhere */
  status?: string | null;
  liveUrl: string | null;
  githubUrl: string | null;
  mode?: PreviewMode;
};

/** The address a button leads to, typed into a chip at the foot of the clip
    (see .sc-url): a padlock for the live site, the GitHub mark for the repo,
    whose host is dimmed like the endcap link's. */
function UrlChip({ kind, url }: { kind: "live" | "code"; url: string }) {
  const bare = bareUrl(url);
  const host = kind === "code" ? "github.com/" : "";
  const rest = bare.slice(host.length);
  return (
    <span
      className={`sc-url sc-url--${kind}`}
      aria-hidden="true"
      style={{ "--n": bare.length } as CSSProperties}
    >
      {kind === "code" ? (
        <svg className="sc-url-icon" viewBox="0 0 98 96" focusable="false">
          <path fillRule="evenodd" clipRule="evenodd" d={GITHUB_MARK} />
        </svg>
      ) : (
        <Lock className="sc-url-icon" />
      )}
      <span className="sc-url-text">
        {host && <span className="sc-url-host">{host}</span>}
        {rest}
      </span>
      <span className="sc-url-caret" />
    </span>
  );
}

export default function ProjectPreview({
  preview,
  name,
  eyebrow,
  status,
  liveUrl,
  githubUrl,
  mode = null,
}: ProjectPreviewProps) {
  const rootRef = useRef<HTMLSpanElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mirrorRef = useRef<HTMLCanvasElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const scanRef = useRef<AsciiScan | null>(null);
  const { introDone } = useSmoothScroll();
  const [near, setNear] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [mirrored, setMirrored] = useState(false);
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
    /* every clip on screen plays; off-screen ones rest to save CPU/battery */
    const activityObserver = new IntersectionObserver(
      (entries) => setIsActive(entries.some((entry) => entry.isIntersecting)),
      { rootMargin: PLAY_AHEAD },
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
    const mirror = mirrorRef.current;
    if (!video || !mirror || !shouldLoad) return;
    const stop = mirrorClip(video, mirror);
    if (!stop) return;
    setMirrored(true);
    return () => {
      stop();
      setMirrored(false);
    };
  }, [shouldLoad]);

  /* "Source code": the clip turns into glyphs. Built on the first hover,
     never with reduced motion — the chip alone says where the button goes. */
  useEffect(() => {
    if (mode === "code") {
      const root = rootRef.current;
      const canvas = canvasRef.current;
      const video = videoRef.current;
      if (!scanRef.current && root && canvas && video && window.matchMedia(NO_MOTION_PREF).matches) {
        scanRef.current = createAsciiScan(root, canvas, video, preview.poster);
      }
      scanRef.current?.show();
    } else {
      scanRef.current?.hide();
    }
  }, [mode, preview.poster]);

  useEffect(
    () => () => {
      scanRef.current?.destroy();
      scanRef.current = null;
    },
    [],
  );

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !shouldLoad) return;

    if (!isActive) {
      video.pause();
      return;
    }

    let resumes = 0;
    let timer = 0;
    const play = () => {
      void video.play().catch(() => {
        /* A browser that blocks autoplay just leaves the card on its first
           decoded frame. */
      });
    };
    /* A clip that should be running but got paused anyway — by the browser
       saving power, reclaiming a decoder, or a tab coming back — is started
       again, a few times at most. */
    const onPause = () => {
      if (document.visibilityState !== "visible" || resumes >= RESUME_LIMIT) return;
      resumes++;
      window.clearTimeout(timer);
      timer = window.setTimeout(play, 200);
    };
    const onPlaying = () => {
      resumes = 0;
    };
    const onVisible = () => {
      if (document.visibilityState === "visible" && video.paused) play();
    };
    video.addEventListener("pause", onPause);
    video.addEventListener("playing", onPlaying);
    document.addEventListener("visibilitychange", onVisible);
    play();

    return () => {
      window.clearTimeout(timer);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("playing", onPlaying);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [isActive, shouldLoad, videoAttempt]);

  const objectPosition = preview.objectPosition ?? "center center";

  return (
    <span
      className="sc-frame"
      ref={rootRef}
      role="img"
      aria-label={`${name} — ${eyebrow} preview`}
      data-mode={mode ?? undefined}
      data-mirrored={mirrored || undefined}
    >
      {/* the clip and the canvas it is painted onto (mirrorClip), in one box
          that takes the hover zoom and the scroll parallax. No autoPlay:
          playback follows isActive above, so a clip that finishes loading
          off-screen doesn't start playing. */}
      <span className="sc-media" aria-hidden="true">
        <video
          className="sc-video"
          ref={videoRef}
          src={shouldLoad ? withAttempt(preview.src, videoAttempt) : undefined}
          muted
          loop
          playsInline
          preload={shouldLoad ? "auto" : "none"}
          style={{ objectPosition }}
          onError={handleVideoError}
        />
        <canvas className="sc-mirror" ref={mirrorRef} width={0} height={0} style={{ objectPosition }} />
      </span>

      <canvas className="sc-ascii" ref={canvasRef} width={0} height={0} aria-hidden="true" />

      {status && (
        <span className="sc-live" aria-hidden="true">
          <span className="sc-live-dot" />
          {status}
        </span>
      )}

      {liveUrl && <UrlChip kind="live" url={liveUrl} />}
      {githubUrl && <UrlChip kind="code" url={githubUrl} />}

      <span className="sc-arrow" aria-hidden="true">
        <ArrowUpRight />
      </span>
    </span>
  );
}
