"use server";

import { createHash } from "node:crypto";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requerirSesion } from "@/lib/sesion";
import { registrarAuditoria } from "@/lib/auditoria";
import { autorizarCrearAnotacion, pareceDatoSensible } from "@/lib/anotaciones";
import { fechaDesdeISO } from "@/lib/fecha";
import { notificarApoderadosDeEstudiante } from "@/lib/notificaciones";

type Resultado =
  | { ok: true; creadas: number }
  | { ok: false; error: string; advertencia?: boolean };

const loteSchema = z.object({
  cursoId: z.string().min(1),
  estudianteIds: z.array(z.string().min(1)).min(1, "Selecciona al menos un estudiante").max(60),
  tipo: z.enum(["POSITIVA", "NEGATIVA", "NEUTRA"]),
  categoria: z.string().trim().max(60).optional().or(z.literal("")),
  texto: z.string().trim().min(3, "Describe el hecho").max(1000),
  fechaHecho: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
});

/**
 * Crea la MISMA anotación en la hoja de vida de varios estudiantes a la vez
 * (p. ej. felicitar a un grupo o registrar un hecho colectivo). Autoriza una
 * vez, valida que todos pertenezcan al colegio (multi-tenant), audita CADA
 * anotación (Circular 30) y avisa a los apoderados de cada uno. El menor se
 * referencia solo por id; el texto no debe incluir datos de salud (Ley 21.719).
 */
export async function crearAnotacionesLote(input: unknown): Promise<Resultado> {
  const parsed = loteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const { cursoId, estudianteIds, tipo, categoria, texto, fechaHecho } = parsed.data;

  const { user } = await requerirSesion();
  if (!autorizarCrearAnotacion(user.rol)) {
    return { ok: false, error: "No tienes permiso para crear anotaciones." };
  }
  if (pareceDatoSensible(texto)) {
    return {
      ok: false,
      advertencia: true,
      error:
        "El texto parece incluir datos de salud. La hoja de vida constata hechos; los datos sensibles van en la ficha de salud. Reformula el texto antes de guardar.",
    };
  }

  const idsUnicos = new Set(estudianteIds);
  if (idsUnicos.size !== estudianteIds.length) {
    return { ok: false, error: "La selección contiene estudiantes repetidos." };
  }

  // El curso y cada estudiante deben estar íntegramente dentro del alcance del
  // funcionario. Ante un solo id inválido se rechaza todo el lote.
  const rolesColegio = new Set(["ADMIN", "DIRECTOR", "UTP", "INSPECTOR"]);
  const curso = await prisma.curso.findFirst({
    where: {
      id: cursoId,
      colegioId: user.colegioId,
      ...(rolesColegio.has(user.rol)
        ? {}
        : {
            OR: [
              { profesorJefeId: user.id },
              { asignaturas: { some: { docenteId: user.id } } },
            ],
          }),
    },
    select: {
      matriculas: {
        where: {
          colegioId: user.colegioId,
          estado: "ACTIVA",
          estudianteId: { in: estudianteIds },
        },
        select: { estudiante: { select: { id: true, nombres: true } } },
      },
    },
  });
  const validos = curso?.matriculas.map((matricula) => matricula.estudiante) ?? [];
  if (!curso || validos.length !== estudianteIds.length) {
    return {
      ok: false,
      error: "No se guardó ninguna anotación: revisa que todos los estudiantes pertenezcan a un curso autorizado.",
    };
  }

  const fecha = fechaHecho ? fechaDesdeISO(fechaHecho) : null;
  const textoHash = createHash("sha256").update(texto).digest("hex");
  await prisma.$transaction(
    async (tx) => {
      for (const est of validos) {
        const a = await tx.anotacion.create({
          data: {
            colegioId: user.colegioId,
            estudianteId: est.id,
            tipo,
            categoria: categoria || null,
            texto,
            fechaHecho: fecha,
            autorId: user.id,
          },
          select: { id: true },
        });
        await registrarAuditoria(
          {
            colegioId: user.colegioId,
            usuarioId: user.id,
            accion: "CREAR",
            entidad: "Anotacion",
            entidadId: a.id,
            despues: {
              tipo,
              categoria: categoria || null,
              fechaHecho: fechaHecho || null,
              textoHash,
              origenLote: true,
            },
          },
          tx
        );
      }
    },
    { timeout: 20000, maxWait: 8000 }
  );

  // Aviso a apoderados (debido proceso), sin el texto ni datos sensibles.
  const tipoLegible = tipo === "POSITIVA" ? "positiva" : tipo === "NEGATIVA" ? "negativa" : "de registro";
  await Promise.allSettled(
    validos.map((est) =>
      notificarApoderadosDeEstudiante(user.colegioId, est.id, {
        tipo: "GENERAL",
        titulo: `Nueva anotación ${tipoLegible}`,
        cuerpo: `Se registró una anotación de ${est.nombres.split(" ")[0]} en la hoja de vida.`,
        enlace: `/mi-pupilo/${est.id}`,
      })
    )
  );

  revalidatePath("/libro-clases/anotaciones");
  return { ok: true, creadas: validos.length };
}
