import { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "./prisma";

type Cliente = PrismaClient | Prisma.TransactionClient;

export type AccionAuditoria =
  | "CREAR"
  | "MODIFICAR"
  | "ELIMINAR"
  | "FIRMAR"
  | "EMITIR"
  | "ANULAR"
  // Acceso de lectura del asistente de IA a datos de estudiantes.
  // Se registran SOLO metadatos (herramienta, curso/ids alcanzados), nunca PII.
  | "CONSULTAR_IA"
  // Aviso automático a apoderados (canales + cantidad, sin PII).
  | "NOTIFICAR_APODERADO"
  // Exportación de reportes normativos (SIGE / actas / respaldo Circular 30).
  // Se registra qué se exportó (tipo, curso/periodo), nunca el contenido.
  | "EXPORTAR"
  // Importación/migración masiva (estudiantes, cursos). Se registra el tipo y
  // cuántas filas se crearon/omitieron, nunca datos personales del archivo.
  | "IMPORTAR";

/**
 * Registra una acción en el audit_log (Circular N°30: log de toda acción
 * sobre el libro de clases). Llamar dentro de la misma transacción que la
 * mutación cuando sea posible.
 *
 * La tabla es append-only: jamás hacer UPDATE/DELETE sobre AuditLog.
 */
export async function registrarAuditoria(
  datos: {
    colegioId: string;
    usuarioId: string;
    accion: AccionAuditoria;
    entidad: string;
    entidadId: string;
    antes?: unknown;
    despues?: unknown;
  },
  cliente: Cliente = prisma
) {
  await cliente.auditLog.create({
    data: {
      colegioId: datos.colegioId,
      usuarioId: datos.usuarioId,
      accion: datos.accion,
      entidad: datos.entidad,
      entidadId: datos.entidadId,
      antes: datos.antes === undefined ? Prisma.DbNull : (datos.antes as Prisma.InputJsonValue),
      despues: datos.despues === undefined ? Prisma.DbNull : (datos.despues as Prisma.InputJsonValue),
    },
  });
}
