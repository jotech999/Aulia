import type { MetadataRoute } from "next";

/**
 * robots.txt: solo la landing pública es indexable. Todas las rutas de la
 * aplicación (datos escolares, requieren sesión) quedan excluidas del rastreo.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/dashboard",
        "/admin",
        "/api",
        "/login",
        "/mi-cuenta",
        "/mi-pupilo",
        "/libro-clases",
        "/planificacion",
        "/comunicacion",
        "/convivencia",
        "/alertas",
        "/pie",
        "/asistente-docente",
        "/certificados",
        "/sostenedor",
        "/verificar",
      ],
    },
    sitemap: "https://aulia.cl/sitemap.xml",
  };
}
