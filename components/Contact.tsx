"use client";

import { useState } from "react";
import AsciiHeading from "@/components/AsciiHeading";
import { site } from "@/lib/site";

/**
 * The flight ends at a giant @, faced square on. The address is set large
 * and plain, so it reads at a glance and can be copied in one click.
 */
export default function Contact() {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(site.email);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      window.location.href = `mailto:${site.email}`;
    }
  };

  return (
    <section id="contact" className="ct" data-section="contact">
      <div className="ct-pin">
        <AsciiHeading text="Let's build." className="ct-title" reveal="radial" />
        <div className="ct-bottom" data-quiet>
          <p className="ct-ask muted">write me</p>
          <a className="ct-mail" href={`mailto:${site.email}`}>
            {site.email}
          </a>
          <p className="ct-actions">
            <a className="tl" href={`mailto:${site.email}`} data-scramble>
              <span data-label>open mail</span>
              <span className="arrow">↗</span>
            </a>
            <button type="button" className="tl" onClick={copy} aria-live="polite">
              <span>{copied ? "copied" : "copy"}</span>
            </button>
          </p>
        </div>
      </div>
    </section>
  );
}
