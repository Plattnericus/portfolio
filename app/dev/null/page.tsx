import type { Metadata } from "next";
import Link from "next/link";
import Lost from "@/components/Lost";

/*
 * Where `cd /dev/null` in the shell leads: the 404's black hole as a page of
 * its own, so falling in is not an error (no 404 in the console).
 */
export const metadata: Metadata = {
  title: "/dev/null",
  robots: { index: false, follow: false },
};

export default function DevNull() {
  return (
    <main className="lost">
      <Lost />
      <div className="lost-copy">
        <h1 className="sr-only">/dev/null</h1>
        <p>Whatever falls in here is gone.</p>
        <Link className="tl" href="/">
          <span>back home</span>
          <span className="arrow">↩</span>
        </Link>
      </div>
    </main>
  );
}
