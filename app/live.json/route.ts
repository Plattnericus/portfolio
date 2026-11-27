import { projects } from "@/lib/site";
import { liveEvery, loadStats } from "@/lib/stats";

/*
 * The numbers that change by the minute (`refresh` in lib/site.ts), apart
 * from /stats.json. Read on request, at most once per refresh window on a
 * server and cached by the CDN for as long, so visitors never multiply the
 * calls to the endpoint behind it. Never prerendered: a build needs no key.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const every = liveEvery(projects);
  const { stats, failed } = await loadStats(projects, "live");
  if (failed.length) console.warn(`live.json: not read: ${failed.join("; ")}`);
  return Response.json(stats, {
    headers: { "cache-control": `public, max-age=0, s-maxage=${every}, stale-while-revalidate=${every}` },
  });
}
