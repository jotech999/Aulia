import type { MetadataRoute } from "next";

/**
 * Sitemap: la única página pública indexable es la landing (las secciones de
 * módulos, planes y demo son anclas dentro de la misma página).
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: "https://educhile.cl",
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
  ];
}
