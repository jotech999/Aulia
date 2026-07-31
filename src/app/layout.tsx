import type { Metadata } from "next";
import "./globals.css";

// Fuentes: stack del sistema (sin dependencia de Google Fonts en build).
// Mantiene las variables --font-body y --font-display que usa globals.css.
const fontVars = {
  "--font-body":
    'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  "--font-display":
    '"Plus Jakarta Sans", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
} as React.CSSProperties;

export const metadata: Metadata = {
  metadataBase: new URL("https://educhile.cl"),
  title: {
    default: "Aulia — Gestión escolar para colegios chilenos",
    template: "%s · Aulia",
  },
  description:
    "Plataforma de gestión escolar chilena: libro de clases, planificación, comunicación con apoderados y administración. Rápida, moderna y a un precio accesible.",
  applicationName: "Aulia",
  keywords: [
    "libro de clases digital",
    "gestión escolar Chile",
    "Circular 30",
    "Decreto 67",
    "SIGE",
    "software colegios",
  ],
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Aulia", statusBarStyle: "default" },
  openGraph: {
    type: "website",
    locale: "es_CL",
    siteName: "Aulia",
    title: "Aulia — El libro de clases digital hecho para profesores",
    description:
      "Asistencia, notas, planificación y comunicación con las familias en una plataforma rápida y moderna, con IA incluida y cumplimiento chileno de fábrica.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Aulia — Gestión escolar para colegios chilenos",
    description:
      "El libro de clases que los profesores de verdad quieren usar. Rápido, moderno y con IA incluida.",
  },
};

export const viewport = {
  themeColor: "#7442d2",
  width: "device-width",
  initialScale: 1,
  // Permite que el contenido llegue hasta los bordes en iPhone con notch
  // (los paddings de safe-area en globals.css evitan que algo quede tapado).
  viewportFit: "cover" as const,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-CL" style={fontVars} suppressHydrationWarning>
      <head>
        {/* Aplica el tema guardado ANTES del primer pintado (evita destello). */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              '(function(){try{var t=localStorage.getItem("aulia:tema");if(t==="oscuro"||(t===null&&matchMedia("(prefers-color-scheme: dark)").matches)){document.documentElement.dataset.tema="oscuro"}}catch(e){}})()',
          }}
        />
      </head>
      <body className="min-h-screen antialiased font-body">{children}</body>
    </html>
  );
}
