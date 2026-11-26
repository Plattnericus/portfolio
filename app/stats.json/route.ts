import { projects } from "@/lib/site";
import { loadStats } from "@/lib/stats";

/*
 * The live numbers under every project (lib/stats.ts), counted when the site
 * is built and again in the background at most every 15 minutes. The page
 * fetches this from its own origin when the projects come into view.
 */
export const dynamic = "force-static";
export const revalidate = 900;

export async function GET() {
  const { stats, failed } = await loadStats(projects);
  if (failed.length) {
    console.warn(`stats.json: not counted: ${failed.join("; ")}`);
    // in the background, a failed count keeps the last complete numbers
    // online (and is retried on the next visit); a build never fails on it
    if (process.env.NEXT_PHASE !== "phase-production-build") throw new Error("stats incomplete");
  }
  return Response.json(stats);
}
