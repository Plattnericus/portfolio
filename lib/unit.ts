"use client";

/**
 * The stylesheet's design pixel (--u in globals.css), in css px: 1 up to
 * 1920 x 1080, larger on bigger screens. Read from the stylesheet itself, so
 * the rule for it lives in one place.
 */
export function designUnit(): number {
  if (typeof document === "undefined") return 1;
  const probe = document.createElement("div");
  probe.style.cssText = "position:absolute;visibility:hidden;pointer-events:none;width:var(--u)";
  document.body.append(probe);
  const u = probe.getBoundingClientRect().width;
  probe.remove();
  return u > 0 ? u : 1;
}
