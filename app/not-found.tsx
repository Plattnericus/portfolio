import type { Metadata } from "next";
import Link from "next/link";
import Lost from "@/components/Lost";

export const metadata: Metadata = {
  title: "404",
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <main className="lost">
      <Lost />
      <div className="lost-copy">
        <h1 className="sr-only">404, page not found</h1>
        <p>This page fell in.</p>
        <Link className="tl" href="/">
          <span>back home</span>
          <span className="arrow">↩</span>
        </Link>
      </div>
    </main>
  );
}
