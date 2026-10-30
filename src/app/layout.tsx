import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Wellness Connect", template: "%s · Wellness Connect" },
  description: "Book verified wellness professionals for your teams, and connect with professionals.",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = { themeColor: "#0f6b5c" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
