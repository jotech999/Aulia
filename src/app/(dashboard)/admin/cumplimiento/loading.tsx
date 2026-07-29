import { Skeleton, SkeletonFilas, SkeletonTarjetas } from "@/components/ui/skeleton";

export default function CargandoCumplimiento() {
  return (
    <div className="mx-auto max-w-7xl" aria-busy="true" aria-label="Cargando centro de cumplimiento">
      <div className="mb-6 flex items-start gap-3">
        <Skeleton className="h-11 w-11 rounded-xl" />
        <div className="flex-1">
          <Skeleton className="h-7 w-64" />
          <Skeleton className="mt-2 h-4 max-w-xl" />
        </div>
      </div>
      <Skeleton className="h-40 w-full rounded-2xl" />
      <div className="mt-5">
        <SkeletonTarjetas n={4} />
      </div>
      <div className="mt-8 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, indice) => (
          <Skeleton key={indice} className="h-64 w-full rounded-xl" />
        ))}
      </div>
      <div className="mt-8">
        <SkeletonFilas n={4} />
      </div>
    </div>
  );
}
