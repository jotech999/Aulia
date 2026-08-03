import Link from "next/link";
import { notFound } from "next/navigation";
import { requerirSesion } from "@/lib/sesion";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import { Iconos } from "@/components/ui/iconos";
import { puedePie, puedeVerApoyosAula } from "@/lib/pie";
import { apoyosHabilitadosPara, listarApoyosDeAula } from "../consultas-apoyos";

const fmtDia = (d: Date) =>
  new Intl.DateTimeFormat("es-CL", { day: "numeric", month: "short", year: "numeric" }).format(d);

/**
 * APOYOS EN MI SALA — la vista PIE del docente.
 *
 * Un profesor no puede aplicar el Decreto 83 si no sabe qué adecuaciones tiene
 * que hacer. Hasta ahora el PIE existía solo para el equipo PIE y la dirección,
 * así que la instrucción llegaba al aula de boca en boca o no llegaba.
 *
 * Aquí ve, de los estudiantes de SUS cursos, únicamente qué hacer en clases.
 * No aparece el diagnóstico ni la bitácora de sesiones: eso es información
 * clínica y no cambia lo que hay que hacer frente al curso.
 */
export default async function ApoyosAulaPage() {
  const { user } = await requerirSesion();
  if (!puedeVerApoyosAula(user.rol)) notFound();

  const habilitado = await apoyosHabilitadosPara(user);
  const apoyos = habilitado ? await listarApoyosDeAula(user) : [];
  const conTexto = apoyos.filter((a) => a.apoyos.length > 0);
  const sinTexto = apoyos.filter((a) => a.apoyos.length === 0);
  const esEquipoPie = puedePie(user.rol);

  return (
    <div className="mx-auto max-w-3xl">
      <EncabezadoPagina
        icono="convivencia"
        titulo="Apoyos en mi sala"
        descripcion="Las adecuaciones que debes aplicar con los estudiantes de tus cursos (Decreto 83)."
      />

      <p className="mb-4 flex items-start gap-2 rounded-lg border-l-2 border-marca-500 bg-marca-50 px-3 py-2.5 text-xs leading-relaxed text-marca-800">
        <span className="mt-px shrink-0">
          <Iconos.candado className="h-4 w-4" />
        </span>
        <span>
          Aquí ves <strong>qué hacer en clases</strong>, no el diagnóstico. El diagnóstico es
          información de salud y queda en el equipo PIE: para enseñar bien no necesitas la etiqueta
          médica, necesitas la indicación pedagógica.{" "}
          {esEquipoPie ? (
            <>
              Como parte del equipo PIE, la ficha completa está en{" "}
              <Link href="/pie" className="font-semibold underline">
                Registros PIE
              </Link>
              .
            </>
          ) : (
            "Si algo no calza con lo que ves en la sala, conversa con el equipo PIE: ellos editan la ficha."
          )}
        </span>
      </p>

      {!habilitado ? (
        /*
         * El colegio decide si su equipo docente puede saber quién participa del
         * PIE (Configuración → indicador PIE). Está apagado por omisión, y aquí
         * se dice con todas sus letras en vez de mostrar una lista vacía que
         * parecería una falla de la plataforma.
         */
        <div className="superficie rounded-xl p-5">
          <h2 className="text-sm font-semibold text-tinta">
            Tu colegio todavía no comparte los apoyos con el equipo docente
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-tinta-suave">
            En Aulia esto viene apagado por omisión: es el colegio el que decide si el profesorado
            puede ver qué estudiantes participan del Programa de Integración Escolar y qué
            adecuaciones aplicar. Pídele a dirección que lo active en{" "}
            <strong>Configuración del colegio</strong>; queda registrado quién lo activó y cuándo.
          </p>
        </div>
      ) : conTexto.length === 0 && sinTexto.length === 0 ? (
        <EstadoVacio
          icono="convivencia"
          titulo="Ningún estudiante de tus cursos tiene adecuaciones registradas"
          descripcion="Cuando el equipo PIE registre los apoyos de un estudiante de tus cursos, aparecerán aquí."
        />
      ) : (
        <ul className="space-y-3">
          {conTexto.map((a) => (
            <li key={a.estudianteId} className="superficie rounded-xl p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <p className="font-semibold text-tinta">{a.nombre}</p>
                <p className="text-xs text-tinta-tenue">
                  {a.curso ? `${a.curso} · ` : ""}actualizado el {fmtDia(a.actualizadaEn)}
                </p>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-tinta-suave">
                {a.apoyos}
              </p>
            </li>
          ))}
        </ul>
      )}

      {sinTexto.length > 0 && (
        <section className="mt-5 rounded-xl border border-alerta/25 bg-alerta-suave/50 p-4">
          <h2 className="text-sm font-semibold text-tinta">
            {sinTexto.length}{" "}
            {sinTexto.length === 1
              ? "estudiante tiene ficha PIE pero sin adecuaciones escritas"
              : "estudiantes tienen ficha PIE pero sin adecuaciones escritas"}
          </h2>
          <p className="mt-0.5 text-xs leading-relaxed text-tinta-suave">
            Están en el programa, pero nadie ha dejado por escrito qué hacer en clases. Sin eso, la
            adecuación depende de que alguien la recuerde.{" "}
            {esEquipoPie
              ? "Complétalas desde la ficha de cada estudiante."
              : "Pídeselas al equipo PIE."}
          </p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {sinTexto.map((a) => (
              <li
                key={a.estudianteId}
                className="rounded-lg border border-borde bg-superficie px-2 py-1 text-xs text-tinta-suave"
              >
                {a.nombre}
                {a.curso ? <span className="text-tinta-tenue"> · {a.curso}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
