import type { MetadataRoute } from "next";
import { BRAND } from "@/lib/brand";

// Installable PWA (blueprint section 11). Icons: the Two leaves mark (public/icons).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${BRAND.name} · ${BRAND.tagline}`,
    short_name: BRAND.name,
    start_url: "/app",
    scope: "/",
    orientation: "portrait",
    display: "standalone",
    background_color: "#f5f7f5",
    theme_color: "#ffffff",
    description: `${BRAND.tagline}: verified wellness professionals for teams.`,
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
