import type { Metadata } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

// Body: Inter para texto, tablas, formularios y datos operativos
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body",
  display: "swap",
});

// Display: Plus Jakarta Sans para títulos y cifras destacadas. Reemplaza a
// Poppins: mismo aire moderno, pero con formas más humanas y menos geométricas,
// que es lo que hace que la interfaz se sienta cercana sin perder autoridad
// frente a un director o un sostenedor.
const displaySans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-display",
  display: "swap",
});

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
    <html lang="es-CL" className={`${inter.variable} ${displaySans.variable}`}>
      <body className="min-h-screen antialiased font-body">{children}</body>
    </html>
  );
}
