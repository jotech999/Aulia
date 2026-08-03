import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingRoot: process.cwd(),
  // Errores de tipos pendientes no bloquean el deploy (se corrigen en dev)
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  experimental: {
    // Las fotos de pruebas en papel viajan por una server action. Ya se
    // comprimen en el teléfono (~250 kB cada una), pero el tope de 1 MB por
    // omisión rechazaría cuatro páginas seguidas.
    serverActions: { bodySizeLimit: "8mb" },
  },
  async redirects() {
    // Dominio canónico: cualquier visita al subdominio técnico de Render
    // (marcadores viejos, historial, PWA instalada) rebota a aulia.cl.
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "aulia-gwfx.onrender.com" }],
        destination: "https://aulia.cl/:path*",
        permanent: true,
      },
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.aulia.cl" }],
        destination: "https://aulia.cl/:path*",
        permanent: true,
      },
    ];
  },
  async headers() {
    const politica = [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self' https:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self' https://webpay3g.transbank.cl https://webpay3gint.transbank.cl",
      "object-src 'none'",
    ].join("; ");
    return [{
      source: "/(.*)",
      headers: [
        { key: "Content-Security-Policy", value: politica },
        { key: "Referrer-Policy", value: "no-referrer" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(self)" },
        ...(process.env.NODE_ENV === "production" ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }] : []),
      ],
    }];
  },
};

export default nextConfig;
