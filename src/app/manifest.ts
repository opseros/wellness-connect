import type { MetadataRoute } from "next";

// Installable PWA (blueprint section 11). Add icons in /public before launch.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Wellness Connect",
    short_name: "Wellness",
    start_url: "/app",
    display: "standalone",
    background_color: "#f5f7f5",
    theme_color: "#0f6b5c",
    icons: [{ src: "/favicon.ico", sizes: "any", type: "image/x-icon" }],
  };
}
