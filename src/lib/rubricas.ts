import { z } from "zod";

export const TIPOS_RUBRICA = ["RUBRICA", "PAUTA_COTEJO"] as const;
export const ESTADOS_RUBRICA = ["BORRADOR", "PUBLICADA", "ARCHIVADA"] as const;

export const ROLES_GESTION_RUBRICAS = new Set(["ADMIN", "DIRECTOR", "UTP"]);

type AsignaturaAutorizable = {
  docenteId: string | null;
  curso: { profesorJefeId: string | null };
};

/**
 * La gestión tiene alcance institucional. Un docente solo actúa sobre una
 * asignatura que dicta o sobre una asignatura de su curso jefatura.
 * El filtro por colegio se resuelve antes, al cargar la asignatura.
 */
export function autorizarRubrica(
  rol: string,
  usuarioId: string,
  asignatura: AsignaturaAutorizable | null
): boolean {
  if (ROLES_GESTION_RUBRICAS.has(rol)) return true;
  if (!asignatura || !["PROFESOR", "PROFESOR_JEFE"].includes(rol)) return false;
  return (
    asignatura.docenteId === usuarioId ||
    asignatura.curso.profesorJefeId === usuarioId
  );
}

/** Una rúbrica genérica publicada queda disponible como plantilla institucional. */
export function autorizarLecturaRubrica(
  rol: string,
  usuarioId: string,
  asignatura: AsignaturaAutorizable | null,
  estado: string
): boolean {
  if (autorizarRubrica(rol, usuarioId, asignatura)) return true;
  return (
    !asignatura &&
    estado === "PUBLICADA" &&
    ["PROFESOR", "PROFESOR_JEFE"].includes(rol)
  );
}

const nivelSchema = z.object({
  etiqueta: z.string().trim().min(1, "Etiqueta requerida").max(80),
  descriptor: z.string().trim().min(1, "Descriptor requerido").max(800),
  puntaje: z.number().finite().min(0).max(10_000),
});

const criterioSchema = z.object({
  descripcion: z.string().trim().min(3, "Describe el criterio").max(400),
  peso: z.number().finite().positive().max(100),
  niveles: z.array(nivelSchema).min(2).max(6),
});

export const guardarRubricaSchema = z
  .object({
    asignaturaId: z.string().trim().min(1).nullable(),
    nombre: z.string().trim().min(3, "Nombre requerido").max(160),
    descripcion: z.string().trim().max(2_000).optional().default(""),
    tipo: z.enum(TIPOS_RUBRICA),
    oaCodigos: z.array(z.string().trim().min(1).max(30)).max(60).default([]),
    criterios: z.array(criterioSchema).min(1).max(30),
  })
  .superRefine((datos, ctx) => {
    if (new Set(datos.oaCodigos).size !== datos.oaCodigos.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["oaCodigos"],
        message: "No repitas objetivos de aprendizaje.",
      });
    }

    datos.criterios.forEach((criterio, indice) => {
      const etiquetas = criterio.niveles.map((nivel) => nivel.etiqueta.toLocaleLowerCase("es"));
      if (new Set(etiquetas).size !== etiquetas.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["criterios", indice, "niveles"],
          message: "Las etiquetas de nivel deben ser distintas.",
        });
      }
      if (datos.tipo === "PAUTA_COTEJO" && criterio.niveles.length !== 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["criterios", indice, "niveles"],
          message: "Una pauta de cotejo requiere exactamente dos opciones.",
        });
      }
    });
  });

export type GuardarRubricaInput = z.infer<typeof guardarRubricaSchema>;

export const idRubricaSchema = z.string().trim().min(1).max(100);

export const vincularEvaluacionSchema = z.object({
  rubricaId: idRubricaSchema,
  evaluacionId: z.string().trim().min(1).max(100),
});

export const guardarAplicacionRubricaSchema = z.object({
  rubricaId: idRubricaSchema,
  evaluacionId: z.string().trim().min(1).max(100),
  estudianteId: z.string().trim().min(1).max(100),
  retroalimentacion: z.string().trim().max(3_000).optional().default(""),
  finalizar: z.boolean().default(false),
  selecciones: z
    .array(
      z.object({
        criterioId: z.string().trim().min(1).max(100),
        nivelId: z.string().trim().min(1).max(100),
        comentario: z.string().trim().max(800).optional().default(""),
      })
    )
    .max(30),
});

export type GuardarAplicacionRubricaInput = z.infer<
  typeof guardarAplicacionRubricaSchema
>;

export type CriterioCalculable = {
  id: string;
  peso: number;
  puntajeMax: number;
};

export type SeleccionCalculable = {
  criterioId: string;
  puntaje: number;
};

/**
 * Mantiene el resultado en puntaje, sin convertirlo implícitamente a nota.
 * El peso es relativo: el máximo mostrado es la suma puntajeMax × peso.
 */
export function calcularPuntajeRubrica(
  criterios: CriterioCalculable[],
  selecciones: SeleccionCalculable[]
): { total: number; maximo: number; porcentaje: number } {
  const porCriterio = new Map(selecciones.map((s) => [s.criterioId, s.puntaje]));
  const maximo = criterios.reduce(
    (suma, criterio) => suma + criterio.puntajeMax * criterio.peso,
    0
  );
  const total = criterios.reduce(
    (suma, criterio) =>
      suma + (porCriterio.get(criterio.id) ?? 0) * criterio.peso,
    0
  );
  const redondear = (valor: number) => Math.round(valor * 100) / 100;
  return {
    total: redondear(total),
    maximo: redondear(maximo),
    porcentaje: maximo > 0 ? redondear((total / maximo) * 100) : 0,
  };
}
