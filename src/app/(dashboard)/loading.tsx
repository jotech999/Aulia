// Estado de carga inicial compartido por todo el dashboard.
// Skeleton sobrio y consistente (mismos primitivos en toda la plataforma),
// sin animación de entrada por fila; el pulso respeta prefers-reduced-motion.

import { Skeleton, SkeletonTarjetas, SkeletonFilas } from "@/components/ui/skeleton";

export default function CargandoDashboard() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Cargando…</span>

      {/* Encabezado */}
      <Skeleton className="h-7 w-56" />
      <Skeleton className="mt-2 h-4 w-72" />

      {/* Tarjetas */}
      <div className="mt-6">
        <SkeletonTarjetas />
      </div>

      {/* Bloque de contenido */}
      <div className="mt-8">
        <SkeletonFilas />
      </div>
    </div>
  );
}
