import { projects } from "@/lib/site";
import { loadExcerpts } from "@/lib/snippets";

/*
 * Real excerpts of every project's code (lib/snippets.ts), built with the
 * site and refreshed at most once a day. The page fetches this from its own
 * origin only when the projects come into view.
 */
export const dynamic = "force-static";
export const revalidate = 86400;

export async function GET() {
  return Response.json(await loadExcerpts(projects));
}
