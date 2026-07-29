"use client";

import Link from "next/link";
import { useState } from "react";
import { guardarAvanceOnboarding } from "./actions";
import { PASO_INFO, type PasoOnboarding } from "@/lib/onboarding";
import { toast } from "@/components/ui/toast";

export function ContinuarOnboarding({ paso }: { paso: PasoOnboarding }) {
  const [guardando, setGuardando] = useState(false);
  const info = PASO_INFO[paso];
  return <Link href={info.href} onClick={async (evento) => {
    evento.preventDefault(); setGuardando(true);
    const res = await guardarAvanceOnboarding(paso); setGuardando(false);
    if (!res.ok) return toast.error(res.error);
    window.location.assign(info.href);
  }} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-marca-600 px-4 text-sm font-semibold text-white hover:bg-marca-700">{guardando ? "Guardando…" : paso === "FINAL" ? "Registrar primera asistencia" : "Continuar configuración"}</Link>;
}
