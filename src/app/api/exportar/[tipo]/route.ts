import { NextRequest } from "next/server";
import { requerirRol } from "@/lib/sesion";
import { prisma } from "@/lib/prisma";
import { registrarAuditoria } from "@/lib/auditoria";
import { respuestaCsv } from "@/lib/exportar";
import {
  planillaAsistenciaMensual,
  actaCalificaciones,
  respaldoAntecedentes,
  respaldoControlAsistencia,
  respaldoCalificaciones,
  reporteRiesgoCurso,
  actaPromocion,
} from "@/lib/exportaciones";

/**
 * Descarga de reportes normativos (P11). Solo dirección/UTP. Verifica que el
 * curso pertenezca al colegio del usuario (multi-tenant) y registra la
 * exportación en audit_log (Circular 30: trazabilidad de accesos/exportaciones).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ tipo: string }> }
) {
  const { user } = await requerirRol("ADMIN", "DIRECTOR", "UTP");
  const { tipo } = await params;
  const sp = req.nextUrl.searchParams;
  const cursoId = sp.get("cursoId") ?? "";

  // Multi-tenant: el curso debe existir en el colegio del usuario.
  const curso = await prisma.curso.findFirst({
    where: { id: cursoId, colegioId: user.colegioId },
    select: { id: true },
  });
  if (!curso) {
    return new Response("Curso no encontrado.", { status: 404 });
  }

  let salida: { archivo: string; csv: string };
  const ahora = new Date();
  const clamp = (v: number, min: number, max: number, def: number) =>
    Number.isFinite(v) && v >= min && v <= max ? v : def;
  const anio = clamp(Number(sp.get("anio")), 2000, 2100, ahora.getUTCFullYear());
  const mes = clamp(Number(sp.get("mes")), 1, 12, ahora.getUTCMonth() + 1);

  switch (tipo) {
    case "asistencia-mensual":
      salida = await planillaAsistenciaMensual(user.colegioId, cursoId, anio, mes);
      break;
    case "acta":
      salida = await actaCalificaciones(user.colegioId, cursoId);
      break;
    case "antecedentes":
      salida = await respaldoAntecedentes(user.colegioId, cursoId);
      break;
    case "control-asistencia":
      salida = await respaldoControlAsistencia(user.colegioId, cursoId);
      break;
    case "calificaciones":
      salida = await respaldoCalificaciones(user.colegioId, cursoId);
      break;
    case "riesgo":
      salida = await reporteRiesgoCurso(user.colegioId, cursoId);
      break;
    case "acta-promocion":
      salida = await actaPromocion(user.colegioId, cursoId);
      break;
    default:
      return new Response("Tipo de exportación no válido.", { status: 400 });
  }

  // Registro de la exportación (qué, no el contenido).
  await registrarAuditoria({
    colegioId: user.colegioId,
    usuarioId: user.id,
    accion: "EXPORTAR",
    entidad: "curso",
    entidadId: cursoId,
    despues: { tipo, anio: tipo === "asistencia-mensual" ? anio : undefined, mes: tipo === "asistencia-mensual" ? mes : undefined },
  });

  return respuestaCsv(salida.archivo, salida.csv);
}
