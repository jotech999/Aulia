import { redirect } from "next/navigation";
import { Isotipo } from "@/components/ui/isotipo";
import { activarPortalEstudiante } from "./actions";

export default async function ActivarPortalPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string }> }) {
  const { token } = await params;
  const { error } = await searchParams;
  async function activar() {
    "use server";
    const resultado = await activarPortalEstudiante(token);
    if (resultado.ok) redirect("/login?portal=activado");
    redirect(`/activar-portal/${encodeURIComponent(token)}?error=1`);
  }
  return <main className="grid min-h-screen place-items-center bg-fondo p-5"><section className="w-full max-w-md rounded-3xl border border-borde bg-superficie p-7 text-center shadow-elevada"><Isotipo className="mx-auto h-12 w-12" /><p className="mt-5 text-xs font-semibold uppercase tracking-[0.14em] text-marca-700">Invitación protegida</p><h1 className="mt-2 font-display text-2xl font-bold text-tinta">Activa tu portal estudiantil</h1><p className="mt-3 text-sm leading-6 text-tinta-suave">Al confirmar, esta cuenta podrá ver únicamente su horario, evaluaciones, resultados publicados y comunicados del colegio.</p>{error && <p className="mt-4 rounded-xl bg-peligro-suave p-3 text-sm text-peligro">La invitación venció, fue revocada o ya se utilizó. Solicita una nueva al colegio.</p>}<form action={activar} className="mt-6"><button type="submit" className="min-h-11 w-full rounded-xl bg-marca-600 px-4 text-sm font-semibold text-white hover:bg-marca-700">Confirmar y activar</button></form><p className="mt-4 text-xs text-tinta-tenue">Este enlace es personal, vence en 24 horas y funciona una sola vez.</p></section></main>;
}
