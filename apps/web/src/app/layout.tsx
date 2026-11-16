import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "frasi. — Jazz Transcription Studio",
  description: "Every note. Every rhythm. Every phrase.",
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#0b0d18",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
