import type { Metadata } from "next";
import Link from "next/link";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy",
  description: `What ${site.domain} does and does not do with your data.`,
  alternates: { canonical: "/privacy" },
};

export default function Privacy() {
  return (
    <main className="legal">
      <h1>Privacy</h1>
      <p>Short version: this site does not track you.</p>

      <h2>No cookies, no analytics</h2>
      <p>
        The site sets no cookies, runs no analytics, no ads and no tracking pixels, and does not build a profile of
        you.
      </p>

      <h2>Nothing from third parties</h2>
      <p>
        Fonts, scripts and the project clips are served from this domain. Your browser does not contact Google Fonts
        or any other third party while you are here. Links to other sites (GitHub, Modrinth, the projects) only take
        you there when you click them; their own privacy policies apply from then on.
      </p>

      <h2>On your device</h2>
      <p>
        One entry is kept in your browser&apos;s local storage: the names of the hidden things you have found
        (<code>plattnericus.secrets</code>). It never leaves your device and you can delete it at any time by clearing
        the site data in your browser. The weather you pick is not stored at all; a reload clears it.
      </p>

      <h2>Camera and files</h2>
      <p>
        One hidden feature can show your camera as ASCII art, and you can drop a picture or video onto the page to see
        it drawn in characters. The camera is only switched on when you ask for it, and only after your browser has
        asked you for permission. Camera frames and dropped files are processed in your browser tab only: nothing is
        uploaded, recorded or stored, and the camera is switched off as soon as you close the view.
      </p>

      <h2>Server logs</h2>
      <p>
        When you open a page, your browser sends a request to the server that hosts this site. Like any web server,
        it may log technical data such as your IP address and the time of the request to keep the service secure and
        running. That data is not used for anything else.
      </p>

      <h2>Email</h2>
      <p>
        If you write to <a href={`mailto:${site.email}`}>{site.email}</a>, your message is only used to answer you.
      </p>

      <h2>Questions</h2>
      <p>
        Anything about your data: <a href={`mailto:${site.email}`}>{site.email}</a>.
      </p>

      <Link className="tl legal-back" href="/">
        <span>back to the site</span>
        <span className="arrow">↩</span>
      </Link>
    </main>
  );
}
