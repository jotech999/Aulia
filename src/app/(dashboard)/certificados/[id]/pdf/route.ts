import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generarPdfCertificado } from "@/lib/pdf/certificado";
import type { SnapshotCertificado, TipoCertificado } from "@/lib/certificados";

// El PDF contiene datos personales completos del menor (nombre, RUT, notas):
// solo el staff del colegio puede descargarlo (Ley 21.719, minimización).
const STAFF = new Set([
  "ADMIN",
  "DIRECTOR",
  "UTP",
  "PROFESOR_JEFE",
  "PROFESOR",
  "INSPECTOR",
]);
// Gestión y front-desk ven cualquier certificado del colegio; los docentes solo
// los de estudiantes de sus cursos (jefatura o asignatura que dictan).
const GESTION = new Set(["ADMIN", "DIRECTOR", "UTP", "INSPECTOR"]);

/**
 * Descarga el PDF de un certificado. Autenticado, solo staff, y multi-tenant:
 * solo el staff del colegio dueño del certificado. El PDF se genera desde el
 * snapshot inmutable.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const sesion = await auth();
  if (!sesion?.user) return new Response("No autorizado", { status: 401 });
  if (!STAFF.has(sesion.user.rol)) {
    return new Response("Prohibido", { status: 403 });
  }
  const { id } = await params;

  const cert = await prisma.certificado.findFirst({
    where: { id, colegioId: sesion.user.colegioId },
    select: {
      tipo: true,
      folio: true,
      datos: true,
      tokenVerificacion: true,
      anuladoEn: true,
      estudiante: {
        select: {
          matriculas: {
            where: { estado: "ACTIVA" },
            take: 1,
            select: {
              curso: { select: { profesorJefeId: true, asignaturas: { select: { docenteId: true } } } },
            },
          },
        },
      },
    },
  });
  if (!cert) return new Response("No encontrado", { status: 404 });

  // Minimización (Ley 21.719): un docente solo descarga certificados de
  // estudiantes de sus cursos (jefatura o asignatura que dicta).
  if (!GESTION.has(sesion.user.rol)) {
    const curso = cert.estudiante.matriculas[0]?.curso;
    const esDocenteDelCurso =
      !!curso &&
      (curso.profesorJefeId === sesion.user.id ||
        curso.asignaturas.some((a) => a.docenteId === sesion.user.id));
    if (!esDocenteDelCurso) return new Response("Prohibido", { status: 403 });
  }

  const origin = new URL(req.url).origin;
  const pdf = await generarPdfCertificado({
    tipo: cert.tipo as TipoCertificado,
    folio: cert.folio,
    snapshot: cert.datos as unknown as SnapshotCertificado,
    token: cert.tokenVerificacion,
    verifyUrl: `${origin}/verificar/${cert.tokenVerificacion}`,
    anulado: cert.anuladoEn !== null,
  });

  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="certificado-${cert.folio}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
