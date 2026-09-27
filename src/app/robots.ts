import type { MetadataRoute } from "next";
import { appUrl } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/account", "/checkout", "/cart", "/api/", "/login", "/register"] }],
    sitemap: `${appUrl()}/sitemap.xml`,
  };
}
