import type { MetadataRoute } from "next";
import { site } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    // the code excerpts are data for the page, not a page of their own
    rules: { userAgent: "*", allow: "/", disallow: ["/code.json"] },
    sitemap: `${site.url}/sitemap.xml`,
  };
}
