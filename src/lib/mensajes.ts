import { prisma } from "./prisma";

/** Rol del usuario dentro de un hilo de mensajes sobre un estudiante. */
export type Participacion = { esApoderado: boolean };

const STAFF_MENSAJES = new Set(["ADMIN", "DIRECTOR", "UTP", "PROFESOR_JEFE"]);

/**
 * ¿Puede este usuario conversar con la contraparte sobre este estudiante?
 * El apoderado, si es su pupilo; el profesor jefe, si es su curso; dirección/UTP/
 * admin, para cualquier estudiante del colegio. Devuelve null si no participa.
 * Acotado al colegio de la sesión (multi-tenant).
 */
export async function participacionEnHilo(
  user: { id: string; rol: string; colegioId: string },
  estudianteId: string
): Promise<Participacion | null> {
  if (user.rol === "APODERADO") {
    const est = await prisma.estudiante.findFirst({
      where: {
        id: estudianteId,
        colegioId: user.colegioId,
        apoderados: { some: { usuarioId: user.id } },
      },
      select: { id: true },
    });
    return est ? { esApoderado: true } : null;
  }

  if (STAFF_MENSAJES.has(user.rol)) {
    const est = await prisma.estudiante.findFirst({
      where: {
        id: estudianteId,
        colegioId: user.colegioId,
        // El profesor jefe solo conversa sobre estudiantes de su curso.
        ...(user.rol === "PROFESOR_JEFE"
          ? { matriculas: { some: { estado: "ACTIVA", curso: { profesorJefeId: user.id } } } }
          : {}),
      },
      select: { id: true },
    });
    return est ? { esApoderado: false } : null;
  }

  return null;
}

/**
 * Cantidad de mensajes sin leer para el badge del menú. Para el apoderado, los
 * que le envió el docente; para el profesor jefe, los de los apoderados de su
 * curso. Otros roles: 0 (no se muestra badge).
 */
export async function contarMensajesNoLeidos(user: {
  id: string;
  rol: string;
  colegioId: string;
}): Promise<number> {
  if (user.rol === "APODERADO") {
    return prisma.mensajeDirecto.count({
      where: {
        colegioId: user.colegioId,
        deApoderado: false,
        leidoEn: null,
        estudiante: { apoderados: { some: { usuarioId: user.id } } },
      },
    });
  }
  if (user.rol === "PROFESOR_JEFE") {
    return prisma.mensajeDirecto.count({
      where: {
        colegioId: user.colegioId,
        deApoderado: true,
        leidoEn: null,
        estudiante: {
          matriculas: { some: { estado: "ACTIVA", curso: { profesorJefeId: user.id } } },
        },
      },
    });
  }
  return 0;
}
