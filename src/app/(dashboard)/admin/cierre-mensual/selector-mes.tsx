"use client";

import { useRouter } from "next/navigation";

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

export function SelectorMes({ anio, mes }: { anio: number; mes: number }) {
  const router = useRouter();
  const ir = (a: number, m: number) => router.push(`/admin/cierre-mensual?anio=${a}&mes=${m}`);
  const prev = () => (mes === 1 ? ir(anio - 1, 12) : ir(anio, mes - 1));
  const next = () => (mes === 12 ? ir(anio + 1, 1) : ir(anio, mes + 1));

  return (
    <div className="inline-flex items-center gap-2 rounded-lg border border-borde bg-superficie p-1 shadow-suave">
      <button type="button" onClick={prev} className="rounded-md px-2.5 py-1 text-sm text-tinta-suave hover:bg-superficie-2" aria-label="Mes anterior">←</button>
      <span className="min-w-[9rem] text-center text-sm font-semibold text-tinta">{MESES[mes - 1]} {anio}</span>
      <button type="button" onClick={next} className="rounded-md px-2.5 py-1 text-sm text-tinta-suave hover:bg-superficie-2" aria-label="Mes siguiente">→</button>
    </div>
  );
}
