import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "frasi. Jazz Transcription Studio",
    short_name: "frasi.",
    description: "Every note. Every rhythm. Every phrase.",
    start_url: "/",
    display: "standalone",
    background_color: "#0b0d18",
    theme_color: "#0b0d18",
    icons: [
      {
        src: "/brand/frasi-emblem.png",
        sizes: "1024x1024",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
