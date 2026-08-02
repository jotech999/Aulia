"use server";

import { randomBytes, createHash } from "crypto";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requerirSesion } from "@/lib/sesion";
import { registrarAuditoria } from "@/lib/auditoria";
import {
  autorizarEmision,
  puedeAnular,
  emitirCertificadoSchema,
  anularCertificadoSchema,
  esInforme,
  LEYENDA_NOTAS_PARCIALES,
  LEYENDA_INFORME_SEMESTRAL,
  LEYENDA_INFORME_ANUAL,
  VIGENCIA_ALUMNO_REGULAR_DIAS,
  type TipoCertificado,
  type SnapshotCertificado,
  type AsignaturaNotas,
} from "@/lib/certificados";
import { calcularPromedio, promedioGeneral, type ItemPromedio } from "@/lib/calificaciones";
import { calcularResumen, type EstadoAsistencia } from "@/lib/asistencia";
import { hoyEnSantiago, fechaDesdeISO } from "@/lib/fecha";
import { nombreCurso } from "@/lib/cursos";

type Resultado<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const CARGO_POR_ROL: Record<string, string> = {
  DIRECTOR: "Dirección",
  ADMIN: "Administración",
  UTP: "Unidad Técnico Pedagógica",
  INSPECTOR: "Inspectoría",
  PROFESOR_JEFE: "Profesor(a) Jefe",
};

function sumarDias(iso: string, dias: number): string {
  const d = fechaDesdeISO(iso);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Construye las notas por asignatura del curso para el informe parcial. */
async function notasDelCurso(
  colegioId: string,
  cursoId: string,
  estudianteId: string,
  periodo: number | null
): Promise<AsignaturaNotas[]> {
  const asignaturas = await prisma.asignatura.findMany({
    where: { cursoId, colegioId },
    select: {
      nombre: true,
      evaluaciones: {
        where: {
          eliminadaEn: null,
          tipo: "SUMATIVA",
          ...(periodo ? { periodo } : {}),
        },
        select: {
          nombre: true,
          ponderacion: true,
          fecha: true,
          calificaciones: {
            where: { estudianteId, eliminadaEn: null },
            select: { nota: true, eximida: true },
          },
        },
        orderBy: { fecha: "asc" },
      },
    },
    orderBy: { nombre: "asc" },
  });

  return asignaturas.map((a) => {
    const evaluaciones = a.evaluaciones.map((e) => {
      const cal = e.calificaciones[0];
      return {
        nombre: e.nombre,
        nota: cal?.nota ?? null,
        eximida: cal?.eximida ?? false,
      };
    });
    const items: ItemPromedio[] = a.evaluaciones.map((e) => {
      const cal = e.calificaciones[0];
      return {
        nota: cal?.eximida ? null : cal?.nota ?? null,
        ponderacion: e.ponderacion,
        computa: !cal?.eximida,
      };
    });
    return {
      asignatura: a.nombre,
      evaluaciones,
      promedio: calcularPromedio(items).promedio,
    };
  });
}

/** % de asistencia del estudiante (PRESENTE+ATRASADO sobre días con registro). */
async function asistenciaDe(colegioId: string, estudianteId: string) {
  const asis = await prisma.asistenciaDiaria.findMany({
    where: { colegioId, estudianteId },
    select: { estado: true },
  });
  return calcularResumen(asis.map((a) => a.estado as EstadoAsistencia));
}

/** Notas anuales: promedio por semestre + promedio final por asignatura. */
async function notasAnuales(
  colegioId: string,
  cursoId: string,
  estudianteId: string
): Promise<AsignaturaNotas[]> {
  const [s1, s2] = await Promise.all([
    notasDelCurso(colegioId, cursoId, estudianteId, 1),
    notasDelCurso(colegioId, cursoId, estudianteId, 2),
  ]);
  const porNombre = new Map<string, AsignaturaNotas>();
  for (const a of s1) porNombre.set(a.asignatura, { ...a, promedioS1: a.promedio, promedioS2: null, evaluaciones: [] });
  for (const a of s2) {
    const prev = porNombre.get(a.asignatura);
    if (prev) prev.promedioS2 = a.promedio;
    else porNombre.set(a.asignatura, { ...a, promedioS1: null, promedioS2: a.promedio, evaluaciones: [] });
  }
  return [...porNombre.values()].map((a) => ({
    ...a,
    promedio: promedioGeneral(
      [a.promedioS1, a.promedioS2].filter((p): p is number => p != null)
    ),
  }));
}

export async function emitirCertificado(
  estudianteIdRaw: string,
  tipoRaw: TipoCertificado,
  periodoRaw?: number,
  conceptoRaw?: string
): Promise<Resultado<{ id: string }>> {
  // Validación en el borde (Zod): tipo del catálogo y periodo 1–3.
  const parsed = emitirCertificadoSchema.safeParse({
    estudianteId: estudianteIdRaw,
    tipo: tipoRaw,
    periodo: periodoRaw,
    concepto: conceptoRaw,
  });
  if (!parsed.success) return { ok: false, error: "Datos inválidos." };
  const { estudianteId, tipo, periodo, concepto } = parsed.data;

  const { user } = await requerirSesion();

  const estudiante = await prisma.estudiante.findFirst({
    where: { id: estudianteId, colegioId: user.colegioId }, // multi-tenant
    select: {
      nombres: true,
      apellidos: true,
      rut: true,
      matriculas: {
        where: { estado: "ACTIVA", retiradaEn: null },
        select: {
          cursoId: true,
          curso: {
            select: {
              nivel: true,
              letra: true,
              profesorJefeId: true,
              anioEscolar: { select: { anio: true } },
            },
          },
        },
        take: 1,
      },
    },
  });
  if (!estudiante) return { ok: false, error: "Estudiante no encontrado." };

  const matricula = estudiante.matriculas[0];
  // Alumno regular exige matrícula vigente (ACTIVA, no retirada) del año en curso.
  if (tipo === "ALUMNO_REGULAR" && !matricula) {
    return {
      ok: false,
      error: "No se puede certificar: el estudiante no tiene matrícula vigente.",
    };
  }
  if (!matricula) {
    return { ok: false, error: "El estudiante no tiene un curso asignado." };
  }

  if (
    !autorizarEmision(tipo, user.rol, user.id, {
      profesorJefeId: matricula.curso.profesorJefeId,
    })
  ) {
    return { ok: false, error: "No tienes permiso para emitir este certificado." };
  }

  const colegio = await prisma.colegio.findUnique({
    where: { id: user.colegioId },
    select: {
      nombre: true,
      rbd: true,
      direccion: true,
      comuna: true,
      directorCargo: true,
    },
  });
  if (!colegio) return { ok: false, error: "Colegio no encontrado." };
  if (!colegio.rbd) {
    return {
      ok: false,
      error: "El colegio no tiene RBD configurado; requerido para emitir certificados.",
    };
  }

  const anio = matricula.curso.anioEscolar.anio;
  const hoy = hoyEnSantiago();

  const snapshot: SnapshotCertificado = {
    colegio: {
      nombre: colegio.nombre,
      rbd: colegio.rbd,
      direccion: colegio.direccion,
      comuna: colegio.comuna,
    },
    estudiante: {
      nombres: estudiante.nombres,
      apellidos: estudiante.apellidos,
      rut: estudiante.rut,
    },
    // Documento oficial: el curso va en lenguaje escolar ("5° básico A"),
    // no con el código interno de la base de datos ("5B A").
    curso: nombreCurso(matricula.curso),
    anio,
    emisor: {
      nombre: user.name ?? "Dirección del establecimiento",
      cargo: colegio.directorCargo ?? CARGO_POR_ROL[user.rol] ?? "Dirección",
    },
    emitidoEnISO: hoy,
  };

  let vigenciaHasta: Date | null = null;
  if (tipo === "ALUMNO_REGULAR") {
    const vigenciaISO = sumarDias(hoy, VIGENCIA_ALUMNO_REGULAR_DIAS);
    snapshot.vigenciaHastaISO = vigenciaISO;
    vigenciaHasta = fechaDesdeISO(vigenciaISO);
  } else if (esInforme(tipo)) {
    const anual = tipo === "INFORME_ANUAL";
    snapshot.anual = anual;
    snapshot.asignaturas = anual
      ? await notasAnuales(user.colegioId, matricula.cursoId, estudianteId)
      : await notasDelCurso(user.colegioId, matricula.cursoId, estudianteId, periodo ?? null);
    if (!anual) snapshot.periodo = periodo ?? 1;

    // Boletín semestral/anual: agrega asistencia, promedio general y concepto.
    if (tipo !== "NOTAS_PARCIALES") {
      const resumen = await asistenciaDe(user.colegioId, estudianteId);
      snapshot.asistenciaPct = resumen.porcentaje;
      snapshot.asistenciaDias = resumen.diasConRegistro;
      snapshot.promedioGeneral = promedioGeneral(
        snapshot.asignaturas.map((a) => a.promedio).filter((p): p is number => p != null)
      );
      if (concepto) snapshot.concepto = concepto;
    }

    // Informe anual: si la dirección YA firmó la resolución de promoción del
    // cierre de año, el informe la declara. Si no existe, el informe no dice
    // nada sobre promoción — no le corresponde adelantarse a la resolución.
    if (anual) {
      const resolucion = await prisma.resolucionPromocion.findFirst({
        where: { colegioId: user.colegioId, estudianteId },
        orderBy: { resueltoEn: "desc" },
        select: { estado: true },
      });
      if (resolucion) snapshot.situacionFinal = resolucion.estado;
    }
    snapshot.leyenda =
      tipo === "INFORME_ANUAL"
        ? LEYENDA_INFORME_ANUAL
        : tipo === "INFORME_SEMESTRAL"
          ? LEYENDA_INFORME_SEMESTRAL
          : LEYENDA_NOTAS_PARCIALES;
  }

  const token = randomBytes(12).toString("hex"); // 24 hex, alta entropía
  const hashContenido = createHash("sha256")
    .update(JSON.stringify(snapshot))
    .digest("hex");

  // Folio secuencial por colegio; reintenta ante colisión por concurrencia.
  for (let intento = 0; intento < 4; intento++) {
    const ultimo = await prisma.certificado.findFirst({
      where: { colegioId: user.colegioId },
      orderBy: { folio: "desc" },
      select: { folio: true },
    });
    const folio = (ultimo?.folio ?? 0) + 1;
    try {
      const cert = await prisma.$transaction(async (tx) => {
        const c = await tx.certificado.create({
          data: {
            colegioId: user.colegioId,
            estudianteId,
            tipo,
            folio,
            tokenVerificacion: token,
            hashContenido,
            datos: snapshot as unknown as Prisma.InputJsonValue,
            anio,
            periodo:
              tipo === "NOTAS_PARCIALES" || tipo === "INFORME_SEMESTRAL" ? periodo ?? 1 : null,
            emitidoPorId: user.id,
            vigenciaHasta,
          },
          select: { id: true },
        });
        await registrarAuditoria(
          {
            colegioId: user.colegioId,
            usuarioId: user.id,
            accion: "EMITIR",
            entidad: "Certificado",
            entidadId: c.id,
            // Solo metadatos, sin datos personales del menor más allá del id.
            despues: { folio, tipo, estudianteId, vigenciaHastaISO: snapshot.vigenciaHastaISO ?? null },
          },
          tx
        );
        return c;
      });
      revalidatePath(`/admin/estudiantes/${estudianteId}`);
      return { ok: true, id: cert.id };
    } catch (e) {
      // P2002 en (colegioId, folio): otro proceso tomó ese folio → reintenta.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        continue;
      }
      return { ok: false, error: "No se pudo emitir el certificado. Reintenta." };
    }
  }
  return { ok: false, error: "No se pudo asignar un folio. Reintenta." };
}

export async function anularCertificado(
  certificadoId: string,
  motivoRaw: string
): Promise<Resultado> {
  const parsed = anularCertificadoSchema.safeParse({ certificadoId, motivo: motivoRaw });
  if (!parsed.success) {
    return { ok: false, error: "Indica el motivo de la anulación." };
  }
  const { motivo } = parsed.data;

  const { user } = await requerirSesion();
  if (!puedeAnular(user.rol)) {
    return { ok: false, error: "No tienes permiso para anular certificados." };
  }

  const cert = await prisma.certificado.findFirst({
    where: { id: certificadoId, colegioId: user.colegioId, anuladoEn: null },
    select: { id: true, estudianteId: true, folio: true },
  });
  if (!cert) return { ok: false, error: "Certificado no encontrado." };

  await prisma.$transaction(async (tx) => {
    await tx.certificado.update({
      where: { id: cert.id },
      data: { anuladoEn: new Date(), anuladoPorId: user.id, motivoAnulacion: motivo.trim() },
    });
    await registrarAuditoria(
      {
        colegioId: user.colegioId,
        usuarioId: user.id,
        accion: "ANULAR",
        entidad: "Certificado",
        entidadId: cert.id,
        despues: { folio: cert.folio, motivo: motivo.trim() },
      },
      tx
    );
  });

  revalidatePath(`/admin/estudiantes/${cert.estudianteId}`);
  return { ok: true };
}
