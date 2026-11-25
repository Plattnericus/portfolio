"use client";

/**
 * A clip that fails to load (a dropped connection, a server hiccup) is asked
 * for again a few times, each after a longer pause; `again` runs after each
 * new attempt, so whoever owns the clip can start it playing if it should.
 */
export function retryVideo(video: HTMLVideoElement, again: () => void, tries = 3): () => void {
  let n = 0;
  let timer = 0;
  const onError = () => {
    if (n >= tries || !video.getAttribute("src")) return;
    n++;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      video.load();
      again();
    }, 700 * n);
  };
  const onLoaded = () => {
    n = 0;
  };
  video.addEventListener("error", onError);
  video.addEventListener("loadeddata", onLoaded);
  return () => {
    window.clearTimeout(timer);
    video.removeEventListener("error", onError);
    video.removeEventListener("loadeddata", onLoaded);
  };
}
