import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requerirSesion } from "@/lib/sesion";
import type { EstadoAsistencia } from "@/lib/asistencia";
import {
  esFechaISOValida,
  fechaDesdeISO,
  formatearFechaLarga,
  hoyEnSantiago,
} from "@/lib/fecha";
import { whereCursosAccesibles } from "./consultas";
import { RegistroAsistencia } from "./registro-cliente";
import { FirmaRapida } from "./firma-rapida-cliente";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { BotonEnlace } from "@/components/ui/boton";
import { nombreCurso, ordenarCursos } from "@/lib/cursos";

export default async function AsistenciaPage({
  searchParams,
}: {
  searchParams: Promise<{ cursoId?: string; fecha?: string; bloqueId?: string }>;
}) {
  const { user } = await requerirSesion();
  const sp = await searchParams;
  const hoy = hoyEnSantiago();
  const fecha = sp.fecha && esFechaISOValida(sp.fecha) ? sp.fecha : hoy;

  // Ojo: el orderBy de la consulta ordena "nivel" como texto, y en Chile eso
  // intercala la media entre la básica (1° básico, I medio, II medio, 3° básico…).
  // El orden pedagógico se aplica en código con ordenarCursos().
  const cursos = await prisma.curso.findMany({
    where: whereCursosAccesibles(user),
    select: { id: true, nivel: true, letra: true },
    orderBy: [{ nivel: "asc" }, { letra: "asc" }],
  });

  const cursoSel = sp.cursoId
    ? cursos.find((c) => c.id === sp.cursoId)
    : undefined;

  const fechaDate = fechaDesdeISO(fecha);
  const diaFecha = fechaDate.getUTCDay();
  const esRolDocente =
    user.rol === "PROFESOR" || user.rol === "PROFESOR_JEFE" || user.rol === "PIE";
  const bloquesDocente = esRolDocente && diaFecha >= 1 && diaFecha <= 5
    ? await prisma.bloqueHorario.findMany({
        where: {
          colegioId: user.colegioId,
          dia: diaFecha,
          eliminadaEn: null,
          asignatura: {
            colegioId: user.colegioId,
            docenteId: user.id,
            cursoId: { in: cursos.map((curso) => curso.id) },
          },
          horarioVersion: {
            estado: "PUBLICADO",
            vigenteDesde: { lte: fechaDate },
            OR: [{ vigenteHasta: null }, { vigenteHasta: { gte: fechaDate } }],
          },
        },
        select: {
          id: true,
          horaInicio: true,
          horaFin: true,
          asignatura: {
            select: {
              nombre: true,
              curso: { select: { id: true, nivel: true, letra: true } },
            },
          },
        },
        orderBy: { horaInicioMin: "asc" },
      })
    : [];

  // ── Sin curso seleccionado: selector de curso ──────────────────────────
  if (!cursoSel) {
    return (
      <div>
        <EncabezadoPagina
          icono="asistencia"
          titulo="Asistencia"
          descripcion={
            esRolDocente
              ? "Elige una clase del horario para pasar la lista por bloque."
              : "Elige un curso para revisar el control diario."
          }
        />

        {/*
          Si el docente no tiene bloques hoy, la sección se muestra igual pero
          vacía y explicada. Omitirla dejaba al profesor de asignatura sin agenda
          y sin ninguna pista de por qué (mismo criterio que el panel de inicio).
        */}
        {esRolDocente && bloquesDocente.length === 0 && (
          <section className="superficie mb-6 rounded-xl px-5 py-6 text-center">
            <p className="font-medium text-tinta">Hoy no tienes clases en tu horario.</p>
            <p className="mt-1 text-sm text-tinta-suave">
              Puedes pasar la lista igual eligiendo un curso más abajo, o revisar tu
              horario si esperabas tener clases hoy.
            </p>
          </section>
        )}

        {bloquesDocente.length > 0 && (
          <section className="mb-6">
            <h2 className="font-display text-base font-semibold">Tus clases de esta jornada</h2>
            <p className="mt-1 text-sm text-tinta-tenue">
              Cada bloque conserva su propia asistencia. La segunda hora también concilia el control diario.
            </p>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {bloquesDocente.map((bloque) => (
                <li key={bloque.id}>
                  <Link
                    href={`/libro-clases/asistencia?cursoId=${bloque.asignatura.curso.id}&bloqueId=${bloque.id}&fecha=${fecha}`}
                    className="superficie tarjeta-int flex min-h-20 items-center gap-3 rounded-xl p-4"
                  >
                    <span className="rounded-lg bg-marca-50 px-2.5 py-1.5 text-sm font-bold text-marca-700">
                      {bloque.horaInicio}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{bloque.asignatura.nombre}</span>
                      <span className="text-sm text-tinta-tenue">
                        {nombreCurso(bloque.asignatura.curso)} · hasta {bloque.horaFin}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {cursos.length === 0 ? (
          <div className="mt-6 rounded-xl border border-dashed border-borde-fuerte bg-superficie p-8 text-center text-sm text-tinta-tenue">
            No tienes cursos asignados.
          </div>
        ) : (
          <section>
            {bloquesDocente.length > 0 && (
              <h2 className="mb-2 text-sm font-semibold text-tinta-suave">Buscar por curso</h2>
            )}
            <ul className="surgir-secuencia grid gap-2 sm:grid-cols-2">
            {ordenarCursos(cursos).map((c) => (
              <li key={c.id}>
                <Link
                  href={`/libro-clases/asistencia?cursoId=${c.id}&fecha=${fecha}`}
                  className="superficie tarjeta-int flex items-center justify-between rounded-xl p-4"
                >
                  <span className="font-semibold">{nombreCurso(c)}</span>
                  <span className="text-tinta-tenue" aria-hidden>
                    →
                  </span>
                </Link>
              </li>
            ))}
            </ul>
          </section>
        )}
      </div>
    );
  }

  const todosBloquesCurso = diaFecha >= 1 && diaFecha <= 5
    ? await prisma.bloqueHorario.findMany({
        where: {
          colegioId: user.colegioId,
          dia: diaFecha,
          eliminadaEn: null,
          asignatura: {
            colegioId: user.colegioId,
            cursoId: cursoSel.id,
          },
          horarioVersion: {
            estado: "PUBLICADO",
            vigenteDesde: { lte: fechaDate },
            OR: [{ vigenteHasta: null }, { vigenteHasta: { gte: fechaDate } }],
          },
        },
        select: {
          id: true,
          horaInicio: true,
          horaFin: true,
          horaInicioMin: true,
          horaFinMin: true,
          asignatura: { select: { id: true, nombre: true, docenteId: true } },
        },
        orderBy: [{ horaInicioMin: "asc" }, { horaFinMin: "asc" }],
      })
    : [];
  const bloquesCurso = esRolDocente
    ? todosBloquesCurso.filter((bloque) => bloque.asignatura.docenteId === user.id)
    : todosBloquesCurso;
  const horasCurso = [...new Map(
    todosBloquesCurso.map((bloque) => [
      `${bloque.horaInicioMin}:${bloque.horaFinMin}`,
      bloque,
    ])
  ).values()];
  const claveSegundaHora = horasCurso[1]
    ? `${horasCurso[1].horaInicioMin}:${horasCurso[1].horaFinMin}`
    : null;
  const bloqueSel = sp.bloqueId
    ? bloquesCurso.find((bloque) => bloque.id === sp.bloqueId)
    : undefined;

  if (esRolDocente && !bloqueSel) {
    return (
      <div>
        <EncabezadoPagina
          icono="asistencia"
          titulo={`Asistencia · ${nombreCurso(cursoSel)}`}
          descripcion="Selecciona la clase exacta que estás impartiendo."
          volver={{ href: `/libro-clases/asistencia?fecha=${fecha}`, etiqueta: "Todas mis clases" }}
        />
        {bloquesCurso.length === 0 ? (
          <div className="mt-6 rounded-xl border border-dashed border-borde-fuerte bg-superficie p-8 text-center text-sm text-tinta-tenue">
            No tienes clases asignadas en este curso para la fecha seleccionada.
          </div>
        ) : (
          <ul className="mt-5 grid gap-2 sm:grid-cols-2">
            {bloquesCurso.map((bloque) => (
              <li key={bloque.id}>
                <Link
                  href={`/libro-clases/asistencia?cursoId=${cursoSel.id}&bloqueId=${bloque.id}&fecha=${fecha}`}
                  className="superficie tarjeta-int flex min-h-20 items-center justify-between rounded-xl p-4"
                >
                  <span>
                    <span className="block font-semibold">{bloque.asignatura.nombre}</span>
                    <span className="text-sm text-tinta-tenue">
                      {bloque.horaInicio}–{bloque.horaFin}
                    </span>
                  </span>
                  {`${bloque.horaInicioMin}:${bloque.horaFinMin}` === claveSegundaHora && (
                    <span className="rounded-full bg-alerta-suave px-2 py-1 text-[11px] font-semibold text-alerta">
                      Control diario
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  // ── Curso seleccionado: lista de estudiantes ───────────────────────────
  const matriculas = await prisma.matricula.findMany({
    where: {
      cursoId: cursoSel.id,
      colegioId: user.colegioId,
      fecha: { lte: fechaDesdeISO(fecha) },
      OR: [{ retiradaEn: null }, { retiradaEn: { gte: fechaDesdeISO(fecha) } }],
    },
    select: {
      estudiante: { select: { id: true, nombres: true, apellidos: true } },
    },
    orderBy: { estudiante: { apellidos: "asc" } },
  });
  const estudiantes = matriculas.map((m) => ({
    id: m.estudiante.id,
    nombre: `${m.estudiante.apellidos}, ${m.estudiante.nombres}`,
  }));

  const esSegundaHora = Boolean(
    bloqueSel &&
    `${bloqueSel.horaInicioMin}:${bloqueSel.horaFinMin}` === claveSegundaHora
  );
  const registros = bloqueSel
    ? (await prisma.asistenciaBloque.findMany({
        where: {
          colegioId: user.colegioId,
          bloqueHorarioId: bloqueSel.id,
          fecha: fechaDate,
          estudianteId: { in: estudiantes.map((e) => e.id) },
        },
        select: { estudianteId: true, estado: true, actualizadaEn: true },
      })).map((registro) => ({
        estudianteId: registro.estudianteId,
        estado: registro.estado,
        actualizadoEn: registro.actualizadaEn,
      }))
    : await prisma.asistenciaDiaria.findMany({
        where: {
          colegioId: user.colegioId,
          fecha: fechaDate,
          estudianteId: { in: estudiantes.map((e) => e.id) },
        },
        select: { estudianteId: true, estado: true, actualizadoEn: true },
      });
  const iniciales: Record<string, EstadoAsistencia> = Object.fromEntries(
    registros.map((r) => [r.estudianteId, r.estado])
  );
  const versionBase = registros.length
    ? new Date(Math.max(...registros.map((r) => r.actualizadoEn.getTime()))).toISOString()
    : new Date(0).toISOString();
  const registrosDiarios = esSegundaHora
    ? await prisma.asistenciaDiaria.findMany({
        where: {
          colegioId: user.colegioId,
          fecha: fechaDate,
          estudianteId: { in: estudiantes.map((estudiante) => estudiante.id) },
        },
        select: { actualizadoEn: true },
      })
    : [];
  const versionDiariaBase = registrosDiarios.length
    ? new Date(Math.max(...registrosDiarios.map((registro) => registro.actualizadoEn.getTime()))).toISOString()
    : new Date(0).toISOString();

  // Siguiente clase del profesor HOY (para saltar al próximo bloque sin volver
  // al selector). Solo aplica si la fecha es hoy y el usuario dicta más clases.
  let siguiente: { cursoId: string; nombre: string; bloqueId?: string } | null = null;
  if (fecha === hoy) {
    const d = new Date(`${hoy}T12:00:00Z`).getUTCDay();
    const diaHoy = d === 0 ? 7 : d;
    const bloquesHoy = await prisma.bloqueHorario.findMany({
      where: {
        colegioId: user.colegioId,
        eliminadaEn: null,
        dia: diaHoy,
        horarioVersion: { estado: "PUBLICADO", vigenteDesde: { lte: fechaDesdeISO(hoy) }, OR: [{ vigenteHasta: null }, { vigenteHasta: { gte: fechaDesdeISO(hoy) } }] },
        asignatura: { docenteId: user.id, colegioId: user.colegioId },
      },
      select: {
        id: true,
        horaInicio: true,
        asignatura: {
          select: {
            nombre: true,
            curso: { select: { id: true, nivel: true, letra: true } },
          },
        },
      },
      orderBy: { horaInicio: "asc" },
    });
    if (bloqueSel) {
      const indice = bloquesHoy.findIndex((bloque) => bloque.id === bloqueSel.id);
      const proximo = indice >= 0 ? bloquesHoy[indice + 1] : undefined;
      if (proximo) {
        siguiente = {
          cursoId: proximo.asignatura.curso.id,
          bloqueId: proximo.id,
          nombre: `${proximo.asignatura.nombre} · ${nombreCurso(proximo.asignatura.curso)}`,
        };
      }
    } else {
      const seq: { id: string; nombre: string }[] = [];
      const vistos = new Set<string>();
      for (const b of bloquesHoy) {
        const c = b.asignatura.curso;
        if (!vistos.has(c.id)) {
          vistos.add(c.id);
          seq.push({ id: c.id, nombre: nombreCurso(c) });
        }
      }
      const idx = seq.findIndex((c) => c.id === cursoSel.id);
      if (idx >= 0 && idx + 1 < seq.length) {
        siguiente = { cursoId: seq[idx + 1].id, nombre: seq[idx + 1].nombre };
      }
    }
  }

  // Firma rápida: clases que el profesor dicta HOY en ESTE curso, para firmar el
  // leccionario sin salir de asistencia, con el contenido de la planificación
  // (la clase siguiente en la secuencia) sugerido automáticamente.
  type FirmaBloque = {
    asignaturaId: string; asignaturaNombre: string; bloqueId: string;
    horaInicio: string; horaFin: string; estado: "pendiente" | "registrada" | "firmada";
    claseId: string | null; contenido: string; sugerido: boolean;
  };
  let firmaHoy: FirmaBloque[] = [];
  if (fecha === hoy) {
    const d = new Date(`${hoy}T12:00:00Z`).getUTCDay();
    const diaHoy = d === 0 ? 7 : d;
    const asigs = await prisma.asignatura.findMany({
      where: { cursoId: cursoSel.id, colegioId: user.colegioId, docenteId: user.id },
      select: {
        id: true, nombre: true,
        bloques: { where: { colegioId: user.colegioId, dia: diaHoy, eliminadaEn: null, horarioVersion: { estado: "PUBLICADO", vigenteDesde: { lte: fechaDesdeISO(hoy) }, OR: [{ vigenteHasta: null }, { vigenteHasta: { gte: fechaDesdeISO(hoy) } }] } }, select: { id: true, horaInicio: true, horaFin: true }, orderBy: { horaInicio: "asc" } },
      },
    });
    const conBloques = asigs.filter((a) => a.bloques.length > 0);
    if (conBloques.length) {
      const asigIds = conBloques.map((a) => a.id);
      const [registradasHoy, conteos, planes] = await Promise.all([
        prisma.claseRegistrada.findMany({
          where: { asignaturaId: { in: asigIds }, colegioId: user.colegioId, fecha: fechaDesdeISO(hoy), eliminadaEn: null },
          select: { id: true, asignaturaId: true, bloqueHorarioId: true, contenido: true, firmadaEn: true },
        }),
        prisma.claseRegistrada.groupBy({
          by: ["asignaturaId"],
          where: { asignaturaId: { in: asigIds }, colegioId: user.colegioId, eliminadaEn: null },
          _count: { _all: true },
        }),
        prisma.planificacion.findMany({
          where: { asignaturaId: { in: asigIds }, colegioId: user.colegioId, tipo: "CLASE", eliminadaEn: null },
          select: { asignaturaId: true, titulo: true, descripcion: true },
          orderBy: [{ fechaInicio: "asc" }, { creadaEn: "asc" }],
        }),
      ]);
      const countDe = new Map(conteos.map((c) => [c.asignaturaId, c._count._all]));
      const planesDe = new Map<string, { titulo: string; descripcion: string | null }[]>();
      for (const p of planes) (planesDe.get(p.asignaturaId) ?? planesDe.set(p.asignaturaId, []).get(p.asignaturaId)!).push(p);

      for (const a of conBloques) {
        for (const b of a.bloques) {
          const reg = registradasHoy.find((r) => r.asignaturaId === a.id && r.bloqueHorarioId === b.id);
          const estado = reg ? (reg.firmadaEn ? "firmada" : "registrada") : "pendiente";
          let contenido = reg?.contenido ?? "";
          let sugerido = false;
          if (!reg) {
            const plan = (planesDe.get(a.id) ?? [])[countDe.get(a.id) ?? 0];
            if (plan) {
              contenido = plan.descripcion?.trim() ? plan.descripcion : plan.titulo;
              sugerido = true;
            }
          }
          firmaHoy.push({ asignaturaId: a.id, asignaturaNombre: a.nombre, bloqueId: b.id, horaInicio: b.horaInicio, horaFin: b.horaFin, estado, claseId: reg?.id ?? null, contenido, sugerido });
        }
      }
      firmaHoy.sort((x, y) => x.horaInicio.localeCompare(y.horaInicio));
    }
  }

  return (
    <div>
      <EncabezadoPagina
        icono="asistencia"
        titulo={bloqueSel ? bloqueSel.asignatura.nombre : nombreCurso(cursoSel)}
        descripcion={
          bloqueSel
            ? `${nombreCurso(cursoSel)} · ${bloqueSel.horaInicio}–${bloqueSel.horaFin} · ${formatearFechaLarga(fecha)}`
            : `${formatearFechaLarga(fecha)} · control diario`
        }
        volver={{
          href: bloqueSel
            ? `/libro-clases/asistencia?cursoId=${cursoSel.id}&fecha=${fecha}`
            : `/libro-clases/asistencia?fecha=${fecha}`,
          etiqueta: bloqueSel ? "Cambiar clase" : "Cambiar curso",
        }}
        acciones={
          <BotonEnlace
            variante="secundario"
            tamano="sm"
            href={`/libro-clases/asistencia/mensual?cursoId=${cursoSel.id}`}
          >
            Vista mensual
          </BotonEnlace>
        }
      />

      {estudiantes.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-borde-fuerte bg-superficie p-8 text-center text-sm text-tinta-tenue">
          Este curso no tiene estudiantes con matrícula activa.
        </div>
      ) : (
        <>
          <RegistroAsistencia
            cursoId={cursoSel.id}
            bloqueHorarioId={bloqueSel?.id}
            esSegundaHora={esSegundaHora}
            fecha={fecha}
            hoy={hoy}
            estudiantes={estudiantes}
            iniciales={iniciales}
            contextoCola={`${user.colegioId}:${user.id}`}
            versionBase={versionBase}
            versionDiariaBase={esSegundaHora ? versionDiariaBase : undefined}
            siguiente={siguiente}
          />
          {firmaHoy.length > 0 && <FirmaRapida bloques={firmaHoy} fecha={fecha} />}
        </>
      )}
    </div>
  );
}
