import type { MetadataRoute } from "next";
import { BRAND } from "@/lib/brand";

// Installable PWA (blueprint section 11). Add icons in /public before launch.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${BRAND.name} · ${BRAND.tagline}`,
    short_name: BRAND.name,
    start_url: "/app",
    display: "standalone",
    background_color: "#f5f7f5",
    theme_color: "#0f6b5c",
    description: `${BRAND.tagline}: verified wellness professionals for teams.`,
    icons: [{ src: "/favicon.ico", sizes: "any", type: "image/x-icon" }],
  };
}
