import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatearRut } from "@/lib/rut";
import { requerirRol } from "@/lib/sesion";
import { isoDesdeFecha } from "@/lib/fecha";
import { autorizarCrearAnotacion } from "@/lib/anotaciones";
import { participacionEnHilo } from "@/lib/mensajes";
import { HiloMensajes } from "@/components/mensajes/hilo";
import { ApoderadosSalud } from "./apoderados-salud";
import { VincularApoderado } from "@/app/(dashboard)/admin/personas/vincular-apoderado";
import { descifrarSeguro } from "@/lib/cifrado";
import { iaDisponible } from "@/lib/ia/cliente";
import { InformeIA } from "./informe-ia-cliente";
import { autorizarEmision, puedeAnular, NOMBRE_TIPO, type TipoCertificado } from "@/lib/certificados";
import {
  calcularResumen,
  UMBRAL_ASISTENCIA,
  type EstadoAsistencia,
} from "@/lib/asistencia";
import {
  calcularPromedio,
  promedioGeneral,
  NOTA_APROBACION,
  type ItemPromedio,
} from "@/lib/calificaciones";
import { Avatar } from "@/components/ui/avatar";
import { BotonImprimir } from "@/components/ui/boton-imprimir";
import { Insignia } from "@/components/ui/insignia";
import {
  puedeRevisarJustificaciones,
  PRESENTACION_ESTADO_JUSTIFICACION,
  type EstadoJustificacionVista,
} from "@/lib/justificaciones";
import { Medidor } from "@/components/ui/viz";
import { Iconos } from "@/components/ui/iconos";
import { Anotaciones } from "./anotaciones-cliente";
import { Certificados } from "./certificados-cliente";
import { puedeVerEntrevistasDe } from "@/app/(dashboard)/convivencia/entrevistas/consultas";
import { PortalEstudiante } from "./portal-estudiante";
import { whereEstudiantesVisibles } from "@/lib/alcance-estudiantes";
import {
  descifrarDetalleJustificacion,
  descifrarFundamentoJustificacion,
  descifrarMotivoJustificacion,
} from "@/lib/cifrado-justificacion";

const fmtDia = (d: Date | null) =>
  d
    ? new Intl.DateTimeFormat("es-CL", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" }).format(d)
    : "";

const STAFF = ["ADMIN", "DIRECTOR", "UTP", "PROFESOR_JEFE", "PROFESOR", "INSPECTOR"];

type Evento =
  | { tipo: "nota"; fecha: Date; titulo: string; sub: string; nota: number }
  | { tipo: "anotacion"; fecha: Date; titulo: string; sub: string; signo: "POSITIVA" | "NEGATIVA" | "NEUTRA" }
  | { tipo: "entrevista"; fecha: Date; titulo: string; sub: string }
  | { tipo: "certificado"; fecha: Date; titulo: string; sub: string; anulado: boolean };

export default async function FichaEstudiantePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ anotar?: string }>;
}) {
  // La ficha es del staff; el apoderado accede por su portal (fase posterior).
  const { user } = await requerirRol(...STAFF);
  const { id } = await params;
  const { anotar } = await searchParams;

  const estudiante = await prisma.estudiante.findFirst({
    where: { id, ...whereEstudiantesVisibles(user) },
    select: {
      id: true,
      rut: true,
      nombres: true,
      apellidos: true,
      fechaNacimiento: true,
      fichaSaludCifrada: true,
      apoderados: {
        select: {
          id: true,
          parentesco: true,
          calidad: true,
          usuario: {
            select: { nombre: true, rut: true, email: true, telefono: true, direccion: true },
          },
        },
        orderBy: { calidad: "asc" }, // TITULAR < SUPLENTE < SIN_CONFIRMAR (orden del enum)
      },
      matriculas: {
        where: { colegioId: user.colegioId, estado: "ACTIVA", retiradaEn: null },
        select: {
          curso: {
            select: {
              id: true,
              nivel: true,
              letra: true,
              profesorJefeId: true,
              anioEscolar: { select: { regimen: true } },
            },
          },
        },
        take: 1,
      },
    },
  });
  if (!estudiante) notFound();

  // Indicador DISCRETO de participación en PIE para el equipo docente del curso:
  // opt-in del colegio + solo el HECHO (EXISTS de FichaPie), nunca el diagnóstico
  // ni la categoría de NEE (Ley 21.719 / Decreto 170). El detalle sigue exclusivo
  // del equipo PIE y la dirección en /pie.
  const colegioCfg = await prisma.colegio.findUnique({
    where: { id: user.colegioId },
    select: { indicadorPieDocentes: true },
  });
  const participaPie = colegioCfg?.indicadorPieDocentes
    ? (await prisma.fichaPie.count({
        where: { estudianteId: estudiante.id, colegioId: user.colegioId, eliminadaEn: null },
      })) > 0
    : false;

  const curso = estudiante.matriculas[0]?.curso;
  const accesoPortal = ["ADMIN", "DIRECTOR"].includes(user.rol)
    ? await prisma.accesoEstudiante.findUnique({
        where: { colegioId_estudianteId: { colegioId: user.colegioId, estudianteId: estudiante.id } },
        select: { activo: true, usuario: { select: { email: true } } },
      })
    : null;

  const [asistencias, asignaturas, anotaciones, certificados, justificaciones] = await Promise.all([
    prisma.asistenciaDiaria.findMany({
      where: { estudianteId: estudiante.id, colegioId: user.colegioId },
      select: { estado: true },
    }),
    // Asignaturas del curso con sus evaluaciones y la nota de este estudiante:
    // sirve para el promedio general y para los eventos de nota de la línea de tiempo.
    curso
      ? prisma.asignatura.findMany({
          where: { cursoId: curso.id, colegioId: user.colegioId },
          select: {
            nombre: true,
            evaluaciones: {
              where: { eliminadaEn: null },
              select: {
                nombre: true,
                fecha: true,
                tipo: true,
                ponderacion: true,
                calificaciones: {
                  where: { estudianteId: estudiante.id, eliminadaEn: null },
                  select: { nota: true, eximida: true },
                },
              },
            },
          },
        })
      : Promise.resolve([]),
    prisma.anotacion.findMany({
      where: { estudianteId: estudiante.id, colegioId: user.colegioId, eliminadaEn: null },
      select: {
        id: true,
        tipo: true,
        categoria: true,
        texto: true,
        fechaHecho: true,
        creadaEn: true,
        autorId: true,
      },
      orderBy: { creadaEn: "desc" },
    }),
    prisma.certificado.findMany({
      where: { estudianteId: estudiante.id, colegioId: user.colegioId },
      select: {
        id: true,
        tipo: true,
        folio: true,
        emitidoEn: true,
        vigenciaHasta: true,
        anuladoEn: true,
        tokenVerificacion: true,
      },
      orderBy: { emitidoEn: "desc" },
    }),
    // Justificaciones de inasistencia enviadas por el apoderado.
    prisma.justificacionInasistencia.findMany({
      where: { estudianteId: estudiante.id, colegioId: user.colegioId },
      select: {
        id: true,
        fecha: true,
        motivo: true,
        detalle: true,
        estado: true,
        fundamentoRevision: true,
      },
      orderBy: { fecha: "desc" },
      take: 20,
    }),
  ]);

  const puedeVerDetalleJustificacion = puedeRevisarJustificaciones(user.rol);
  const justificacionesVisibles = justificaciones.map((justificacion) => ({
    ...justificacion,
    motivo: puedeVerDetalleJustificacion
      ? descifrarMotivoJustificacion(justificacion.motivo)
      : "Antecedente reservado",
    detalle: puedeVerDetalleJustificacion
      ? descifrarDetalleJustificacion(justificacion.detalle)
      : null,
    fundamentoRevision: puedeVerDetalleJustificacion
      ? descifrarFundamentoJustificacion(justificacion.fundamentoRevision)
      : null,
  }));

  // Hilo de mensajes con el apoderado (solo si este staff participa del hilo).
  const participacion = await participacionEnHilo(user, estudiante.id);
  const mensajes = participacion
    ? await prisma.mensajeDirecto.findMany({
        where: { colegioId: user.colegioId, estudianteId: estudiante.id },
        orderBy: { creadoEn: "asc" },
        take: 100,
        select: { id: true, deApoderado: true, cuerpo: true, creadoEn: true },
      })
    : [];

  // Nombres de los autores de anotaciones (una sola query; el audit_log conserva el rastro).
  const autores = await prisma.usuario.findMany({
    where: { id: { in: [...new Set(anotaciones.map((a) => a.autorId))] } },
    select: { id: true, nombre: true },
  });
  const nombreAutor = new Map(autores.map((a) => [a.id, a.nombre]));

  // ── Indicadores clave ────────────────────────────────────────────────────
  const resumenAsis = calcularResumen(asistencias.map((a) => a.estado as EstadoAsistencia));

  const finalesAsig = asignaturas
    .map((a) => {
      const items: ItemPromedio[] = a.evaluaciones
        .filter((e) => e.tipo === "SUMATIVA")
        .map((e) => {
          const cal = e.calificaciones[0];
          return {
            nota: cal?.eximida ? null : cal?.nota ?? null,
            ponderacion: e.ponderacion,
            computa: !cal?.eximida,
          };
        });
      return calcularPromedio(items).promedio;
    })
    .filter((p): p is number => p !== null);
  const promGeneral = promedioGeneral(finalesAsig);

  const anotPos = anotaciones.filter((a) => a.tipo === "POSITIVA").length;
  const anotNeg = anotaciones.filter((a) => a.tipo === "NEGATIVA").length;

  // ── Línea de tiempo unificada ────────────────────────────────────────────
  const eventos: Evento[] = [];
  for (const a of asignaturas) {
    for (const e of a.evaluaciones) {
      const cal = e.calificaciones[0];
      if (cal && !cal.eximida && cal.nota != null) {
        eventos.push({ tipo: "nota", fecha: e.fecha, titulo: e.nombre, sub: a.nombre, nota: cal.nota });
      }
    }
  }
  for (const a of anotaciones) {
    eventos.push({
      tipo: "anotacion",
      fecha: a.fechaHecho ?? a.creadaEn,
      titulo: a.texto,
      sub: `${a.categoria ? `${a.categoria} · ` : ""}${nombreAutor.get(a.autorId) ?? "—"}`,
      signo: a.tipo as "POSITIVA" | "NEGATIVA" | "NEUTRA",
    });
  }

  const permisosCert = {
    alumnoRegular: autorizarEmision("ALUMNO_REGULAR", user.rol, user.id, { profesorJefeId: curso?.profesorJefeId ?? null }),
    notas: autorizarEmision("NOTAS_PARCIALES", user.rol, user.id, { profesorJefeId: curso?.profesorJefeId ?? null }),
    anular: puedeAnular(user.rol),
  };
  const periodos = curso?.anioEscolar.regimen === "TRIMESTRAL" ? [1, 2, 3] : [1, 2];

  for (const c of certificados) {
    eventos.push({
      tipo: "certificado",
      fecha: c.emitidoEn,
      titulo: NOMBRE_TIPO[c.tipo as TipoCertificado] ?? "Documento oficial",
      sub: `Folio ${c.folio}`,
      anulado: c.anuladoEn !== null,
    });
  }

  // Entrevistas: dato sensible, solo para docentes del estudiante, dirección e inspectoría.
  const puedeEntrevistas = await puedeVerEntrevistasDe(user, estudiante.id);
  const entrevistas = puedeEntrevistas
    ? await prisma.entrevista.findMany({
        where: { estudianteId: estudiante.id, colegioId: user.colegioId, eliminadaEn: null },
        orderBy: { fecha: "desc" },
        select: { id: true, apoderado: true, motivo: true, acuerdos: true, compromisos: true, fecha: true, proximaCita: true, autorId: true },
      })
    : [];
  const autoresEnt = entrevistas.length
    ? await prisma.usuario.findMany({
        where: { id: { in: [...new Set(entrevistas.map((e) => e.autorId))] } },
        select: { id: true, nombre: true },
      })
    : [];
  const nombreAutorEnt = new Map(autoresEnt.map((a) => [a.id, a.nombre]));
  for (const e of entrevistas) {
    eventos.push({ tipo: "entrevista", fecha: e.fecha, titulo: e.motivo, sub: `Apoderado: ${e.apoderado}` });
  }

  eventos.sort((a, b) => b.fecha.getTime() - a.fecha.getTime());
  const timeline = eventos.slice(0, 14);

  return (
    <div className="animar-surgir">
      <Link href="/admin/estudiantes" data-noprint className="text-xs text-tinta-tenue hover:text-tinta-suave">
        ← Volver a estudiantes
      </Link>

      {/* Cabecera: avatar + identidad */}
      <header className="mt-2 flex items-center gap-4">
        <Avatar nombres={estudiante.nombres} apellidos={estudiante.apellidos} tamano="xl" className="shadow-suave" />
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-2xl font-bold tracking-tight text-tinta sm:text-3xl">
            {estudiante.nombres} {estudiante.apellidos}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-tinta-suave">
            <span className="tabular-nums">{formatearRut(estudiante.rut)}</span>
            {curso && (
              <span className="rounded-md bg-marca-50 px-2 py-0.5 text-xs font-semibold text-marca-600">
                {curso.nivel} {curso.letra}
              </span>
            )}
            {participaPie && (
              <span
                className="rounded-md bg-superficie-3 px-2 py-0.5 text-xs font-semibold text-tinta-suave"
                title="Participa en el Programa de Integración Escolar. El detalle está reservado al equipo PIE y la dirección."
              >
                PIE
              </span>
            )}
          </div>
        </div>
        <div data-noprint className="shrink-0">
          <BotonImprimir>Imprimir ficha</BotonImprimir>
        </div>
      </header>

      <PortalEstudiante estudianteId={estudiante.id} correoActual={accesoPortal?.activo ? accesoPortal.usuario.email : null} puedeGestionar={["ADMIN", "DIRECTOR"].includes(user.rol)} />

      {/* Indicadores clave — sin scroll */}
      <section className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="superficie flex items-center gap-4 rounded-xl p-5">
          <Medidor valor={resumenAsis.porcentaje} etiqueta="" umbral={UMBRAL_ASISTENCIA} />
          <div>
            <p className="text-sm font-medium text-tinta-suave">Asistencia</p>
            <p className="mt-0.5 text-xs text-tinta-tenue">
              {resumenAsis.diasConRegistro} días con registro
            </p>
          </div>
        </div>

        <div className="superficie flex flex-col justify-center rounded-xl p-5">
          <div className="flex items-start justify-between">
            <p className="text-sm font-medium text-tinta-suave">Promedio general</p>
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-marca-50 text-marca-600">
              <Iconos.calificaciones className="h-[18px] w-[18px]" />
            </span>
          </div>
          <p className={`mt-3 font-display text-4xl font-bold tabular-nums ${promGeneral !== null && promGeneral < NOTA_APROBACION ? "text-peligro" : "text-tinta"}`}>
            {promGeneral === null ? "—" : promGeneral.toFixed(1)}
          </p>
          <p className="mt-1 text-xs text-tinta-tenue">Escala 1.0–7.0</p>
        </div>

        <div className="superficie flex flex-col justify-center rounded-xl p-5">
          <p className="text-sm font-medium text-tinta-suave">Anotaciones</p>
          <div className="mt-3 flex items-end gap-4">
            <div>
              <p className="font-display text-3xl font-bold tabular-nums text-exito">{anotPos}</p>
              <p className="mt-0.5 text-xs text-tinta-tenue">positivas</p>
            </div>
            <div className="h-9 w-px bg-borde" aria-hidden />
            <div>
              <p className="font-display text-3xl font-bold tabular-nums text-peligro">{anotNeg}</p>
              <p className="mt-0.5 text-xs text-tinta-tenue">negativas</p>
            </div>
          </div>
          {autorizarCrearAnotacion(user.rol) && (
            <Link
              href={`/admin/estudiantes/${estudiante.id}?anotar=1#hoja-de-vida`}
              className="mt-3 inline-flex w-fit items-center gap-1 text-xs font-medium text-marca-600 hover:text-marca-700"
            >
              + Anotar
            </Link>
          )}
        </div>
      </section>

      {/* Línea de tiempo unificada */}
      <section className="mt-8">
        <h2 className="font-display text-lg font-semibold tracking-tight">Línea de tiempo</h2>
        <p className="mt-0.5 text-xs text-tinta-tenue">Notas, anotaciones, entrevistas y certificados.</p>
        {timeline.length === 0 ? (
          <p className="superficie mt-3 rounded-xl px-5 py-8 text-center text-sm text-tinta-suave">
            Aún no hay actividad registrada para este estudiante.
          </p>
        ) : (
          <ol className="mt-4 space-y-0">
            {timeline.map((ev, i) => (
              <li key={i} className="flex gap-3.5">
                {/* Riel vertical */}
                <div className="flex flex-col items-center">
                  <EventoIcono ev={ev} />
                  {i < timeline.length - 1 && <span className="w-px flex-1 bg-borde" aria-hidden />}
                </div>
                <div className="min-w-0 flex-1 pb-5">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                    <p className="min-w-0 text-sm font-medium text-tinta">
                      <EventoEtiqueta ev={ev} />
                    </p>
                    <span className="shrink-0 text-xs tabular-nums text-tinta-tenue">{fmtDia(ev.fecha)}</span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-tinta-tenue">{ev.sub}</p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* Gestión: certificados, anotaciones y entrevistas (acciones) */}
      <div className="mt-8 border-t border-borde pt-2">
        <Certificados
          estudianteId={estudiante.id}
          tieneMatricula={Boolean(curso)}
          permisos={permisosCert}
          periodos={periodos}
          certificados={certificados.map((c) => ({
            id: c.id,
            tipo: c.tipo,
            folio: c.folio,
            emitidoEn: c.emitidoEn.toISOString(),
            vigenciaHasta: c.vigenciaHasta ? c.vigenciaHasta.toISOString() : null,
            anulado: c.anuladoEn !== null,
            token: c.tokenVerificacion,
          }))}
        />

        {iaDisponible() && autorizarCrearAnotacion(user.rol) && (
          <InformeIA estudianteId={estudiante.id} />
        )}

        {(() => {
          // Ficha de apoderados y antecedentes médicos (pedido docente).
          const esDireccion = ["ADMIN", "DIRECTOR"].includes(user.rol);
          const esJefeDelCurso =
            estudiante.matriculas[0]?.curso.profesorJefeId === user.id;
          const puedeVerSalud = esDireccion || esJefeDelCurso || user.rol === "INSPECTOR";
          return (
            <ApoderadosSalud
              estudianteId={estudiante.id}
              puedeEditar={esDireccion}
              puedeVerSalud={puedeVerSalud}
              antecedentes={
                puedeVerSalud && estudiante.fichaSaludCifrada ? descifrarSeguro(estudiante.fichaSaludCifrada) : ""
              }
              apoderados={estudiante.apoderados.map((a) => ({
                apoderadoId: a.id,
                nombre: a.usuario.nombre,
                rut: a.usuario.rut,
                email: a.usuario.email,
                telefono: a.usuario.telefono,
                direccion: a.usuario.direccion,
                parentesco: a.parentesco,
                calidad: a.calidad,
              }))}
            />
          );
        })()}

        {/* Vincular un apoderado ya registrado (caso hermanos): evita crear
            una cuenta duplicada reescribiendo los mismos datos. */}
        {["ADMIN", "DIRECTOR"].includes(user.rol) && (
          <div className="mt-3">
            <VincularApoderado estudianteId={estudiante.id} />
          </div>
        )}

        {participacion && (
          <section id="mensajes" className="mt-8 scroll-mt-20">
            <h2 className="text-lg font-semibold">Mensajes con el apoderado</h2>
            <HiloMensajes
              estudianteId={estudiante.id}
              soyApoderado={false}
              contraparte="el apoderado"
              mensajes={mensajes.map((m) => ({
                id: m.id,
                deApoderado: m.deApoderado,
                cuerpo: m.cuerpo,
                creadoEn: m.creadoEn.toISOString(),
              }))}
            />
          </section>
        )}

        {justificaciones.length > 0 && (
          <section className="mt-8">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold">Justificaciones de inasistencia</h2>
                <p className="mt-0.5 text-xs text-tinta-tenue">La asistencia y su porcentaje conservan el registro original.</p>
              </div>
              {puedeRevisarJustificaciones(user.rol) && (
                <Link href="/inspector/justificaciones" className="btn btn-secundario btn-sm">
                  Abrir bandeja
                </Link>
              )}
            </div>
            <ul className="mt-3 space-y-2">
              {justificacionesVisibles.map((j) => {
                const estado = j.estado as EstadoJustificacionVista;
                const presentacion = PRESENTACION_ESTADO_JUSTIFICACION[estado];
                return (
                  <li key={j.id} className="superficie flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl p-4 text-sm">
                    <span className="font-medium tabular-nums text-tinta">
                      {new Intl.DateTimeFormat("es-CL", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" }).format(j.fecha)}
                    </span>
                    <Insignia tono={presentacion.tono} punto>{presentacion.etiqueta}</Insignia>
                    <span className="text-xs font-semibold text-tinta-suave">{j.motivo}</span>
                    {j.detalle && <span className="w-full text-tinta-suave">{j.detalle}</span>}
                    {j.fundamentoRevision && (
                      <span className="w-full rounded-lg bg-superficie-2 p-3 text-tinta-suave">
                        <span className="font-semibold text-tinta">Resolución:</span> {j.fundamentoRevision}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <Anotaciones
          estudianteId={estudiante.id}
          puedeCrear={autorizarCrearAnotacion(user.rol)}
          autoAbrir={anotar === "1"}
          usuarioId={user.id}
          rol={user.rol}
          anotaciones={anotaciones.map((a) => ({
            id: a.id,
            tipo: a.tipo,
            categoria: a.categoria,
            texto: a.texto,
            fechaHecho: a.fechaHecho ? isoDesdeFecha(a.fechaHecho) : null,
            creadaEn: a.creadaEn.toISOString(),
            autorId: a.autorId,
            autorNombre: nombreAutor.get(a.autorId) ?? "—",
          }))}
        />

        {puedeEntrevistas && (
          <section className="mt-8">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-lg font-semibold tracking-tight">Entrevistas y reuniones</h2>
              <Link
                href={`/convivencia/entrevistas/nueva?estudianteId=${estudiante.id}`}
                className="btn btn-primario btn-sm"
              >
                Registrar entrevista
              </Link>
            </div>

            {entrevistas.length === 0 ? (
              <p className="superficie mt-3 rounded-xl px-5 py-6 text-sm text-tinta-suave">
                No hay entrevistas registradas.
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {entrevistas.map((e) => (
                  <li key={e.id} className="superficie rounded-xl p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium text-tinta">{e.motivo}</p>
                      <span className="text-xs text-tinta-tenue">{fmtDia(e.fecha)}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-tinta-tenue">
                      Apoderado: {e.apoderado} · Registró: {nombreAutorEnt.get(e.autorId) ?? "—"}
                    </p>
                    {e.acuerdos && (
                      <p className="mt-2 text-sm text-tinta-suave">
                        <span className="font-medium text-tinta">Acuerdos:</span> {e.acuerdos}
                      </p>
                    )}
                    {e.compromisos && (
                      <p className="mt-1 text-sm text-tinta-suave">
                        <span className="font-medium text-tinta">Compromisos:</span> {e.compromisos}
                      </p>
                    )}
                    {e.proximaCita && (
                      <p className="mt-2 inline-block rounded-md bg-alerta-suave px-2 py-0.5 text-xs font-semibold text-alerta">
                        Próxima cita: {fmtDia(e.proximaCita)}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

// ── Piezas de la línea de tiempo ────────────────────────────────────────────

function EventoIcono({ ev }: { ev: Evento }) {
  const base = "flex h-8 w-8 shrink-0 items-center justify-center rounded-full";
  if (ev.tipo === "nota") {
    const bien = ev.nota >= NOTA_APROBACION;
    return (
      <span className={`${base} ${bien ? "bg-exito-suave text-exito" : "bg-peligro-suave text-peligro"}`}>
        <Iconos.calificaciones className="h-4 w-4" />
      </span>
    );
  }
  if (ev.tipo === "anotacion") {
    const cls =
      ev.signo === "POSITIVA"
        ? "bg-exito-suave text-exito"
        : ev.signo === "NEGATIVA"
          ? "bg-peligro-suave text-peligro"
          : "bg-superficie-3 text-tinta-suave";
    return <span className={`${base} ${cls}`}>{ev.signo === "NEGATIVA" ? "−" : ev.signo === "POSITIVA" ? "+" : "•"}</span>;
  }
  if (ev.tipo === "entrevista") {
    return (
      <span className={`${base} bg-marca-50 text-marca-600`}>
        <Iconos.comunicacion className="h-4 w-4" />
      </span>
    );
  }
  return (
    <span className={`${base} bg-marca-50 text-marca-600`}>
      <Iconos.firma className="h-4 w-4" />
    </span>
  );
}

function EventoEtiqueta({ ev }: { ev: Evento }) {
  if (ev.tipo === "nota") {
    const bien = ev.nota >= NOTA_APROBACION;
    return (
      <>
        <span className={`font-bold tabular-nums ${bien ? "text-exito" : "text-peligro"}`}>{ev.nota.toFixed(1)}</span>{" "}
        en {ev.titulo}
      </>
    );
  }
  if (ev.tipo === "certificado") {
    return (
      <>
        {ev.titulo}
        {ev.anulado && <span className="ml-1.5 rounded bg-peligro-suave px-1.5 py-0.5 text-[11px] font-semibold text-peligro">Anulado</span>}
      </>
    );
  }
  // anotacion / entrevista: el texto/motivo puede ser largo → limitar a 2 líneas
  return <span className="line-clamp-2">{ev.titulo}</span>;
}
