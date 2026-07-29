/**
 * Primitivos de esqueleto de carga, consistentes en toda la plataforma.
 * El pulso respeta `prefers-reduced-motion` (desactivado globalmente en
 * globals.css). Presentacional puro (server-safe).
 */

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`esqueleto rounded-md ${className}`} />;
}

/** Fila de tarjetas de indicador (mismo ritmo que los dashboards reales). */
export function SkeletonTarjetas({ n = 3 }: { n?: number }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="superficie rounded-xl p-5">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="mt-3 h-8 w-16" />
        </div>
      ))}
    </div>
  );
}

/** Filas de lista (tarjetas de dos líneas). */
export function SkeletonFilas({ n = 4 }: { n?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="superficie rounded-xl p-4">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="mt-2 h-3 w-2/3" />
        </div>
      ))}
    </div>
  );
}
