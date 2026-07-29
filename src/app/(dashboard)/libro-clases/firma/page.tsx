import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requerirSesion } from "@/lib/sesion";
import { autorizarRegistroClase } from "@/lib/firma";
import { isoDesdeFecha, hoyEnSantiago, fechaDesdeISO } from "@/lib/fecha";
import { whereAsignaturasFirma } from "./consultas";
import { RegistroClases } from "./registro-cliente";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Insignia } from "@/components/ui/insignia";
import { BotonImprimir } from "@/components/ui/boton-imprimir";
import { colorAsignatura } from "@/lib/colores-asignatura";
import { nombreCurso } from "@/lib/cursos";


const DIA_LARGO = ["", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];

/** Día de la semana (1=lunes … 7=domingo) para una fecha ISO chilena. */
function diaSemana(iso: string): number {
  const d = new Date(`${iso}T12:00:00Z`).getUTCDay(); // 0=domingo … 6=sábado
  return d === 0 ? 7 : d;
}

export default async function FirmaPage({
  searchParams,
}: {
  searchParams: Promise<{
    asignaturaId?: string;
    bloqueId?: string;
    planificacionId?: string;
  }>;
}) {
  const { user } = await requerirSesion();
  const sp = await searchParams;
  const fechaHorarioActual = fechaDesdeISO(hoyEnSantiago());

  const asignaturas = await prisma.asignatura.findMany({
    where: whereAsignaturasFirma(user),
    select: {
      id: true,
      nombre: true,
      color: true,
      docenteId: true,
      curso: {
        select: {
          nivel: true,
          letra: true,
          profesorJefeId: true,
          anioEscolar: { select: { anio: true } },
        },
      },
      bloques: {
        where: {
          colegioId: user.colegioId,
          eliminadaEn: null,
          horarioVersion: {
            estado: "PUBLICADO",
            vigenteDesde: { lte: fechaHorarioActual },
            OR: [{ vigenteHasta: null }, { vigenteHasta: { gte: fechaHorarioActual } }],
          },
        },
        select: { id: true, dia: true, horaInicio: true, horaFin: true },
        orderBy: [{ dia: "asc" }, { horaInicio: "asc" }],
      },
    },
    orderBy: [{ curso: { nivel: "asc" } }, { nombre: "asc" }],
  });

  const asignaturaSel = sp.asignaturaId
    ? asignaturas.find((a) => a.id === sp.asignaturaId)
    : undefined;

  if (!asignaturaSel) {
    const hoy = hoyEnSantiago();
    const diaHoy = diaSemana(hoy);

    // Clases que le tocan HOY según el horario (bloques del día), ordenadas por hora.
    const clasesHoy = asignaturas
      .flatMap((a) => a.bloques.filter((b) => b.dia === diaHoy).map((b) => ({ a, b })))
      .sort((x, y) => x.b.horaInicio.localeCompare(y.b.horaInicio));

    // Estado de firma de cada clase de hoy (muestra el ✓ tipo Lirmi).
    const registradasHoy = clasesHoy.length
      ? await prisma.claseRegistrada.findMany({
          where: {
            colegioId: user.colegioId,
            asignaturaId: { in: [...new Set(clasesHoy.map((c) => c.a.id))] },
            fecha: fechaDesdeISO(hoy),
            eliminadaEn: null,
          },
          select: { asignaturaId: true, bloqueHorarioId: true, firmadaEn: true },
        })
      : [];
    const estadoDe = (aId: string, bId: string) => {
      const r = registradasHoy.find(
        (x) => x.asignaturaId === aId && x.bloqueHorarioId === bId
      );
      if (!r) return "pendiente" as const;
      return r.firmadaEn ? ("firmada" as const) : ("registrada" as const);
    };

    // Progreso del día: cuántas clases de hoy ya están firmadas. El ✓ de día
    // completo (tipo Lirmi) aparece cuando no queda nada pendiente.
    const totalHoy = clasesHoy.length;
    const firmadasHoy = clasesHoy.filter(
      ({ a, b }) => estadoDe(a.id, b.id) === "firmada"
    ).length;
    const diaCompleto = totalHoy > 0 && firmadasHoy === totalHoy;

    return (
      <div>
        <EncabezadoPagina
          icono="firma"
          titulo="Leccionario"
          descripcion="Registra los contenidos tratados y firma la clase realizada."
        />

        {/* Clases de hoy según tu horario */}
        <section>
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-display text-lg font-semibold tracking-tight">
              Clases de hoy
            </h2>
            <div className="flex items-center gap-2.5">
              {totalHoy > 0 &&
                (diaCompleto ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-exito-suave px-2.5 py-1 text-xs font-semibold text-exito">
                    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden>
                      <path d="M4 10.5l3.5 3.5L16 5.5" />
                    </svg>
                    Día completo
                  </span>
                ) : (
                  <span className="text-xs font-medium tabular-nums text-tinta-tenue">
                    {firmadasHoy} de {totalHoy} firmadas
                  </span>
                ))}
              <span className="text-sm capitalize text-tinta-tenue">{DIA_LARGO[diaHoy]}</span>
            </div>
          </div>

          {/* Progreso visual del día: cuánto queda por firmar, de un vistazo */}
          {totalHoy > 0 && (
            <div
              role="progressbar"
              aria-valuenow={firmadasHoy}
              aria-valuemin={0}
              aria-valuemax={totalHoy}
              aria-label={`${firmadasHoy} de ${totalHoy} clases firmadas`}
              className="mt-3 h-1.5 overflow-hidden rounded-full bg-superficie-3"
            >
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  diaCompleto ? "bg-exito" : "bg-gradient-to-r from-marca-500 to-acento"
                }`}
                style={{ width: `${Math.round((firmadasHoy / totalHoy) * 100)}%` }}
              />
            </div>
          )}

          {clasesHoy.length === 0 ? (
            <div className="superficie mt-3 rounded-xl px-5 py-8 text-center text-sm text-tinta-suave">
              No tienes clases programadas para hoy ({DIA_LARGO[diaHoy]}). Puedes
              registrar una clase desde “Todas mis asignaturas”.
            </div>
          ) : (
            <ul className="surgir-secuencia mt-3 space-y-2">
              {clasesHoy.map(({ a, b }) => {
                const estado = estadoDe(a.id, b.id);
                return (
                  <li key={b.id}>
                    <Link
                      href={`/libro-clases/firma?asignaturaId=${a.id}&bloqueId=${b.id}#registrar-clase`}
                      className="superficie tarjeta-int flex min-h-20 items-center gap-4 overflow-hidden rounded-xl p-0 pr-4"
                    >
                      <span className={`h-20 w-1.5 shrink-0 self-stretch ${colorAsignatura(a.nombre, a.color).punto}`} aria-hidden />
                      <span className="flex shrink-0 flex-col items-center rounded-lg bg-superficie-3 px-3 py-1.5 text-xs font-semibold tabular-nums text-tinta-suave">
                        <span>{b.horaInicio}</span>
                        <span className="text-[11px] font-normal text-tinta-tenue">{b.horaFin}</span>
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 truncate font-semibold text-tinta">
                          <span
                            className={`h-2.5 w-2.5 shrink-0 rounded-full ${colorAsignatura(a.nombre, a.color).punto}`}
                            aria-hidden
                          />
                          {a.nombre}
                        </p>
                        <p className="text-xs text-tinta-tenue">{nombreCurso(a.curso)}</p>
                      </div>
                      {estado === "firmada" ? (
                        <Insignia tono="exito" punto>Firmada</Insignia>
                      ) : estado === "registrada" ? (
                        <Insignia tono="alerta" punto>Sin firmar</Insignia>
                      ) : (
                        <Insignia tono="neutra">Pendiente</Insignia>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Todas mis asignaturas (para firmar otros días o clases pasadas) */}
        <section className="mt-8">
          <h2 className="font-display text-base font-semibold tracking-tight text-tinta-suave">
            Todas mis asignaturas
          </h2>
          {asignaturas.length === 0 ? (
            <div className="superficie mt-3 rounded-xl px-5 py-8 text-center text-sm text-tinta-tenue">
              No tienes asignaturas asignadas.
            </div>
          ) : (
            // Agrupadas por curso: mucho más fácil de escanear cuando el docente
            // hace clases en varios cursos (pedido de los profesores).
            [...new Map(asignaturas.map((a) => [nombreCurso(a.curso), true])).keys()].map(
              (curso) => (
                <div key={curso} className="mt-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-tinta-tenue">
                    {curso}
                  </p>
                  <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                    {asignaturas
                      .filter((a) => nombreCurso(a.curso) === curso)
                      .map((a) => (
                        <li key={a.id}>
                          <Link
                            href={`/libro-clases/firma?asignaturaId=${a.id}`}
                            className="superficie tarjeta-int flex items-center justify-between rounded-xl p-4"
                          >
                            <span className="flex items-center gap-1.5">
                              <span
                                className={`h-2.5 w-2.5 shrink-0 rounded-full ${colorAsignatura(a.nombre, a.color).punto}`}
                                aria-hidden
                              />
                              <span className="font-semibold">{a.nombre}</span>
                            </span>
                            <span className="text-tinta-tenue" aria-hidden>→</span>
                          </Link>
                        </li>
                      ))}
                  </ul>
                </div>
              )
            )
          )}
        </section>
      </div>
    );
  }

  const puedeGestionar = autorizarRegistroClase(user.rol, user.id, {
    docenteId: asignaturaSel.docenteId,
    profesorJefeId: asignaturaSel.curso.profesorJefeId,
  });

  const anioAsignatura = asignaturaSel.curso.anioEscolar.anio;
  // El leccionario conserva cualquier registro del año calendario escolar,
  // incluidos ajustes/recuperaciones de enero o febrero.
  const inicioAnioEscolar = fechaDesdeISO(`${anioAsignatura}-01-01`);
  const finAnioEscolar = fechaDesdeISO(`${anioAsignatura}-12-31`);

  const bloques = await prisma.bloqueHorario.findMany({
    where: {
      colegioId: user.colegioId,
      asignaturaId: asignaturaSel.id,
      eliminadaEn: null,
      horarioVersion: {
        estado: "PUBLICADO",
        vigenteDesde: { lte: finAnioEscolar },
        OR: [
          { vigenteHasta: null },
          { vigenteHasta: { gte: inicioAnioEscolar } },
        ],
      },
    },
    select: {
      id: true,
      dia: true,
      horaInicio: true,
      horaFin: true,
      horarioVersion: {
        select: { numero: true, vigenteDesde: true, vigenteHasta: true },
      },
    },
    orderBy: [{ dia: "asc" }, { horaInicio: "asc" }],
  });

  const clases = await prisma.claseRegistrada.findMany({
    where: {
      asignaturaId: asignaturaSel.id,
      colegioId: user.colegioId,
      eliminadaEn: null,
    },
    select: {
      id: true,
      fecha: true,
      contenido: true,
      oaIds: true,
      bloqueHorarioId: true,
      firmadaPorId: true,
      firmadaEn: true,
      planificacionOrigenId: true,
      planificacionOrigenVersion: true,
      planificacionOrigen: {
        select: {
          titulo: true,
          padre: { select: { titulo: true } },
        },
      },
    },
    orderBy: { fecha: "desc" },
    take: 30,
  });

  // Clases planificadas (tipo CLASE) de esta asignatura, para "copiar desde el
  // plan" al leccionario — pedido explícito de la profesora.
  const planesClase = await prisma.planificacion.findMany({
    where: {
      asignaturaId: asignaturaSel.id,
      colegioId: user.colegioId,
      tipo: "CLASE",
      esPlantilla: false,
      eliminadaEn: null,
    },
    select: {
      id: true,
      titulo: true,
      descripcion: true,
      fechaInicio: true,
      version: true,
      oas: { select: { oaCodigo: true } },
      padre: { select: { id: true, titulo: true } },
    },
    // El número de clase debe coincidir con Planificación: orden de creación
    // dentro de cada unidad, incluso si luego se ajusta la fecha prevista.
    orderBy: { creadaEn: "asc" },
    take: 80,
  });

  const firmantes = await prisma.usuario.findMany({
    where: {
      id: {
        in: [
          ...new Set(
            clases.map((c) => c.firmadaPorId).filter((x): x is string => !!x)
          ),
        ],
      },
    },
    select: { id: true, nombre: true },
  });
  const nombreFirmante = new Map(firmantes.map((f) => [f.id, f.nombre]));
  const contadorPorUnidad = new Map<string, number>();
  const planesConContexto = planesClase
    .map((plan) => {
      const clave = plan.padre?.id ?? "sin-unidad";
      const numeroClase = (contadorPorUnidad.get(clave) ?? 0) + 1;
      contadorPorUnidad.set(clave, numeroClase);
      return {
        id: plan.id,
        titulo: plan.titulo,
        contenido: plan.descripcion?.trim() ? plan.descripcion : plan.titulo,
        unidad: plan.padre?.titulo ?? null,
        numeroClase,
        version: plan.version,
        fechaInicio: plan.fechaInicio ? isoDesdeFecha(plan.fechaInicio) : null,
        oaCodigos: plan.oas.map((o) => o.oaCodigo),
      };
    })
    .sort(
      (a, b) =>
        (a.unidad ?? "").localeCompare(b.unidad ?? "", "es") ||
        a.numeroClase - b.numeroClase
    );

  return (
    <div>
      <Link
        href="/libro-clases/firma"
        className="text-xs text-tinta-tenue hover:text-tinta-suave"
      >
        ← Cambiar asignatura
      </Link>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className={`h-12 w-1.5 shrink-0 rounded-full ${colorAsignatura(asignaturaSel.nombre, asignaturaSel.color).punto}`} aria-hidden />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{asignaturaSel.nombre}</h1>
            <p className="mt-0.5 text-sm text-tinta-tenue">
              {nombreCurso(asignaturaSel.curso)}
            </p>
          </div>
        </div>
        <div data-noprint>
          <BotonImprimir>Imprimir leccionario</BotonImprimir>
        </div>
      </div>

      {!puedeGestionar && (
        <p className="mt-4 rounded-xl border border-alerta/20 bg-alerta-suave px-4 py-2 text-sm text-alerta">
          Solo puedes consultar: no eres docente de esta asignatura.
        </p>
      )}

      <RegistroClases
        asignaturaId={asignaturaSel.id}
        asignaturaNombre={asignaturaSel.nombre}
        asignaturaColor={asignaturaSel.color}
        puedeGestionar={puedeGestionar}
        rol={user.rol}
        usuarioId={user.id}
        usuarioNombre={user.name ?? "Docente"}
        hoy={hoyEnSantiago()}
        bloques={bloques.map((bloque) => ({
          id: bloque.id,
          dia: bloque.dia,
          horaInicio: bloque.horaInicio,
          horaFin: bloque.horaFin,
          versionNumero: bloque.horarioVersion?.numero ?? null,
          vigenteDesde: bloque.horarioVersion
            ? isoDesdeFecha(bloque.horarioVersion.vigenteDesde)
            : null,
          vigenteHasta: bloque.horarioVersion?.vigenteHasta
            ? isoDesdeFecha(bloque.horarioVersion.vigenteHasta)
            : null,
        }))}
        bloqueInicialId={
          sp.bloqueId && bloques.some((bloque) => bloque.id === sp.bloqueId)
            ? sp.bloqueId
            : null
        }
        planificacionInicialId={
          sp.planificacionId &&
          planesConContexto.some((plan) => plan.id === sp.planificacionId)
            ? sp.planificacionId
            : null
        }
        planesClase={planesConContexto}
        clases={clases.map((c) => ({
          id: c.id,
          fecha: isoDesdeFecha(c.fecha),
          contenido: c.contenido,
          oaIds: c.oaIds,
          bloqueHorarioId: c.bloqueHorarioId,
          firmadaEn: c.firmadaEn ? c.firmadaEn.toISOString() : null,
          firmadaPorId: c.firmadaPorId,
          firmadaPorNombre: c.firmadaPorId
            ? nombreFirmante.get(c.firmadaPorId) ?? "—"
            : null,
          planificacionOrigenId: c.planificacionOrigenId,
          planificacionOrigenVersion: c.planificacionOrigenVersion,
          planificacionOrigenTitulo: c.planificacionOrigen?.titulo ?? null,
          planificacionOrigenUnidad:
            c.planificacionOrigen?.padre?.titulo ?? null,
        }))}
      />
    </div>
  );
}
