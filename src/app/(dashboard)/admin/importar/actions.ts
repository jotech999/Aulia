"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requerirSesion } from "@/lib/sesion";
import { registrarAuditoria } from "@/lib/auditoria";
import {
  parsearCsv,
  filasComoObjetos,
  validarEstudiantes,
  validarCursos,
  resumen,
  type FilaValidada,
  type TipoImportacion,
} from "@/lib/importar";

const ROLES = new Set(["ADMIN", "DIRECTOR"]);

const entrada = z.object({
  tipo: z.enum(["estudiantes", "cursos"]),
  contenido: z.string().min(1, "Archivo vacío.").max(2_000_000, "El archivo es demasiado grande (máx. 2 MB)."),
});

type FilaVista = { fila: number; errores: string[]; valores: string[]; ok: boolean };

type Previsualizacion = {
  ok: true;
  tipo: TipoImportacion;
  columnas: string[];
  filas: FilaVista[];
  resumen: { total: number; validas: number; invalidas: number };
} | { ok: false; error: string };

async function autorizar() {
  const { user } = await requerirSesion();
  if (!ROLES.has(user.rol)) return null;
  return user;
}

/**
 * Conjuntos de existencia (multi-tenant) para validar contra la BD.
 * Los cursos se acotan al AÑO ESCOLAR ACTIVO (mismo año destino de la creación),
 * porque la unicidad de curso es por [anioEscolarId, nivel, letra]: sin acotar,
 * un colegio con más de un año matricularía al curso equivocado y rechazaría
 * cursos válidos que existieron en un año anterior.
 */
async function contexto(colegioId: string) {
  const anio = await prisma.anioEscolar.findFirst({
    where: { colegioId },
    orderBy: { anio: "desc" },
    select: { id: true },
  });
  const [estudiantes, cursos] = await Promise.all([
    prisma.estudiante.findMany({ where: { colegioId }, select: { rut: true } }),
    anio
      ? prisma.curso.findMany({
          where: { colegioId, anioEscolarId: anio.id },
          select: { id: true, nivel: true, letra: true },
        })
      : Promise.resolve([] as { id: string; nivel: string; letra: string }[]),
  ]);
  const rutsExistentes = new Set(estudiantes.map((e) => e.rut));
  const cursoPorClave = new Map(cursos.map((c) => [`${c.nivel}${c.letra}`, c.id]));
  const clavesCurso = new Set(cursoPorClave.keys());
  return { rutsExistentes, cursoPorClave, clavesCurso, anioEscolarId: anio?.id ?? null };
}

function validar(
  tipo: TipoImportacion,
  registros: Record<string, string>[],
  ctx: { rutsExistentes: Set<string>; clavesCurso: Set<string> }
): FilaValidada<unknown>[] {
  return tipo === "estudiantes"
    ? validarEstudiantes(registros, ctx.rutsExistentes, ctx.clavesCurso)
    : validarCursos(registros, ctx.clavesCurso);
}

function aVista(columnas: string[], filas: FilaValidada<unknown>[], registros: Record<string, string>[]): FilaVista[] {
  return filas.map((f, i) => ({
    fila: f.fila,
    errores: f.errores,
    ok: f.datos !== null,
    valores: columnas.map((c) => registros[i][c] ?? ""),
  }));
}

export async function previsualizar(input: unknown): Promise<Previsualizacion> {
  const parsed = entrada.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const user = await autorizar();
  if (!user) return { ok: false, error: "No tienes permiso para importar." };

  const { encabezados, registros } = filasComoObjetos(parsearCsv(parsed.data.contenido));
  if (registros.length === 0) return { ok: false, error: "El archivo no tiene filas de datos." };

  const ctx = await contexto(user.colegioId);
  const validadas = validar(parsed.data.tipo, registros, ctx);

  return {
    ok: true,
    tipo: parsed.data.tipo,
    columnas: encabezados,
    filas: aVista(encabezados, validadas, registros),
    resumen: resumen(validadas),
  };
}

type ResultadoConfirmar = { ok: true; creadas: number; omitidas: number } | { ok: false; error: string };

export async function confirmar(input: unknown): Promise<ResultadoConfirmar> {
  const parsed = entrada.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const user = await autorizar();
  if (!user) return { ok: false, error: "No tienes permiso para importar." };

  const { registros } = filasComoObjetos(parsearCsv(parsed.data.contenido));
  if (registros.length === 0) return { ok: false, error: "El archivo no tiene filas de datos." };

  const ctx = await contexto(user.colegioId);
  const validadas = validar(parsed.data.tipo, registros, ctx);
  const validas = validadas.filter((f) => f.datos !== null);
  const omitidas = validadas.length - validas.length;

  if (validas.length === 0) return { ok: false, error: "No hay filas válidas para importar." };

  let creadas = 0;
  try {
    if (parsed.data.tipo === "cursos") {
      if (!ctx.anioEscolarId) return { ok: false, error: "El colegio no tiene un año escolar configurado." };
      await prisma.$transaction(async (tx) => {
        for (const f of validas) {
          const d = f.datos as { nivel: string; letra: string };
          await tx.curso.create({ data: { colegioId: user.colegioId, anioEscolarId: ctx.anioEscolarId!, nivel: d.nivel, letra: d.letra } });
          creadas++;
        }
        await registrarAuditoria(
          { colegioId: user.colegioId, usuarioId: user.id, accion: "IMPORTAR", entidad: "curso", entidadId: "importacion", despues: { creadas, omitidas } },
          tx
        );
      });
    } else {
      const fechaMatricula = new Date();
      await prisma.$transaction(async (tx) => {
        for (const f of validas) {
          const d = f.datos as { rut: string; nombres: string; apellidos: string; fechaNacimiento: string | null; cursoClave: string | null };
          const est = await tx.estudiante.create({
            data: {
              colegioId: user.colegioId,
              rut: d.rut,
              nombres: d.nombres,
              apellidos: d.apellidos,
              fechaNacimiento: d.fechaNacimiento ? new Date(`${d.fechaNacimiento}T00:00:00Z`) : null,
            },
            select: { id: true },
          });
          creadas++;
          // Matrícula opcional al curso indicado (parte del libro de clases → auditada abajo).
          const cursoId = d.cursoClave ? ctx.cursoPorClave.get(d.cursoClave) : undefined;
          if (cursoId) {
            await tx.matricula.create({ data: { colegioId: user.colegioId, estudianteId: est.id, cursoId, fecha: fechaMatricula } });
          }
        }
        await registrarAuditoria(
          { colegioId: user.colegioId, usuarioId: user.id, accion: "IMPORTAR", entidad: "estudiante", entidadId: "importacion", despues: { creadas, omitidas } },
          tx
        );
      });
    }
  } catch (e) {
    console.error("[importar]", e instanceof Error ? e.message : "error");
    return { ok: false, error: "No se pudo completar la importación. No se creó ninguna fila." };
  }

  revalidatePath("/admin/estudiantes");
  revalidatePath("/admin/cursos");
  return { ok: true, creadas, omitidas };
}
