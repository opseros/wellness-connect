import type { Metadata, Viewport } from "next";
// Self-hosted fonts (no request to Google at runtime).
import "@fontsource-variable/plus-jakarta-sans/wght.css";
import "@fontsource-variable/bricolage-grotesque/opsz.css";
import "./globals.css";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = {
  title: { default: `${BRAND.name} · ${BRAND.tagline}`, template: `%s · ${BRAND.name}` },
  description: `${BRAND.name} ${BRAND.tagline}: book verified wellness professionals for your teams, and connect with professionals.`,
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = { themeColor: "#0f6b5c" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-IN">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
