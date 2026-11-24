import { site } from "@/lib/site";

export const dynamic = "force-static";

/** RFC 9116. Built at deploy time; Expires is a year after the build. */
export function GET() {
  const expires = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString();
  const body = [
    `Contact: mailto:${site.email}`,
    `Expires: ${expires}`,
    "Preferred-Languages: en, de",
    `Canonical: ${site.url}/.well-known/security.txt`,
    "",
  ].join("\n");
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
