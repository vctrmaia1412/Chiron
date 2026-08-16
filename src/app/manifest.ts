import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CHIRON Veterinary Platform",
    short_name: "CHIRON",
    description: "Protótipo visual de gestão veterinária profissional.",
    start_url: "/",
    display: "standalone",
    background_color: "#F7FAF9",
    theme_color: "#0F766E",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
