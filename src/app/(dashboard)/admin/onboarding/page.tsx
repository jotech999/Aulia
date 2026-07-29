import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requerirSesion } from "@/lib/sesion";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { PASO_INFO, PASOS_ONBOARDING, primerPasoPendiente, type PasoOnboarding } from "@/lib/onboarding";
import { ContinuarOnboarding } from "./continuar-cliente";

export default async function OnboardingPage() {
  const { user } = await requerirSesion();
  if (!["ADMIN", "DIRECTOR"].includes(user.rol)) redirect("/dashboard");
  const [colegio, anios, cursos, equipo, estudiantes, bloques, asistencias, estado] = await Promise.all([
    prisma.colegio.findUnique({ where: { id: user.colegioId }, select: { rbd: true, nombre: true, direccion: true, email: true } }),
    prisma.anioEscolar.count({ where: { colegioId: user.colegioId } }),
    prisma.curso.count({ where: { colegioId: user.colegioId } }),
    prisma.membresia.count({ where: { colegioId: user.colegioId, activa: true } }),
    prisma.matricula.count({ where: { colegioId: user.colegioId, estado: "ACTIVA" } }),
    prisma.bloqueHorario.count({ where: { colegioId: user.colegioId, eliminadaEn: null } }),
    prisma.asistenciaDiaria.count({ where: { colegioId: user.colegioId } }),
    prisma.onboardingColegio.findUnique({ where: { colegioId: user.colegioId } }),
  ]);
  const completos: Record<PasoOnboarding, boolean> = {
    DATOS_COLEGIO: Boolean(colegio?.rbd && colegio.nombre && colegio.direccion && colegio.email),
    ANIO_ESCOLAR: anios > 0,
    CURSOS: cursos > 0,
    EQUIPO: equipo > 1,
    ESTUDIANTES: estudiantes > 0,
    HORARIO: bloques > 0,
    FINAL: asistencias > 0,
  };
  const proximo = primerPasoPendiente(completos);
  const completados = PASOS_ONBOARDING.filter((p) => completos[p]).length;
  const porcentaje = Math.round((completados / PASOS_ONBOARDING.length) * 100);
  return <div className="space-y-6">
    <EncabezadoPagina icono="cursos" titulo="Puesta en marcha" descripcion="Configura el colegio por etapas y retoma exactamente donde quedaste." />
    <section className="encabezado-cine rounded-2xl p-6 text-white shadow-elevada">
      <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm text-white/70">Avance del colegio</p><p className="mt-1 font-display text-4xl font-bold tabular-nums">{porcentaje}%</p><p className="mt-1 text-sm text-white/75">{estado?.estado === "COMPLETADO" && completos.FINAL ? "Configuración operativa" : `Próximo: ${PASO_INFO[proximo].titulo}`}</p></div><ContinuarOnboarding paso={proximo} /></div>
      <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-acento transition-all" style={{ width: `${porcentaje}%` }} /></div>
    </section>
    <ol className="grid gap-3">{PASOS_ONBOARDING.map((paso, indice) => { const info = PASO_INFO[paso]; const listo = completos[paso]; return <li key={paso} className={`superficie flex items-center gap-4 rounded-xl p-4 ${paso === proximo ? "ring-2 ring-marca-500/25" : ""}`}><span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-bold ${listo ? "bg-exito-suave text-exito" : paso === proximo ? "bg-marca-600 text-white" : "bg-superficie-3 text-tinta-tenue"}`}>{listo ? "✓" : indice + 1}</span><div className="min-w-0 flex-1"><p className="font-semibold text-tinta">{info.titulo}</p><p className="text-sm text-tinta-tenue">{info.detalle}</p></div><Link href={info.href} className="rounded-lg px-3 py-2 text-sm font-semibold text-marca-600 hover:bg-marca-50">{listo ? "Revisar" : paso === proximo ? "Continuar" : "Abrir"}</Link></li>; })}</ol>
  </div>;
}
