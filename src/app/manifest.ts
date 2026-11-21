import type { MetadataRoute } from "next";

// Makes ScholarSync installable ("Add to Home Screen" / "Install app"). Colors are the light theme's canvas and brand.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "ScholarSync",
    short_name: "ScholarSync",
    description: "Group projects, in sync: team chat, tasks, files and peer review.",
    start_url: "/student/courses",
    scope: "/",
    display: "standalone",
    background_color: "#f7f0e6",
    theme_color: "#a6482a",
    categories: ["education", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
