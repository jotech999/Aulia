import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requerirSesion } from "@/lib/sesion";
import { autorizarLecturaRubrica } from "@/lib/rubricas";
import { escaparHtml } from "@/lib/email";

/**
 * Descarga de una rúbrica/pauta como documento Word (pedido docente: "que se
 * genere en una hoja Word la rúbrica que creo"). Se genera como HTML con
 * Content-Type de Word: Word y LibreOffice lo abren como documento editable,
 * sin dependencias nuevas en el servidor.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ rubricaId: string }> }
) {
  const { user } = await requerirSesion();
  const { rubricaId } = await params;

  const rubrica = await prisma.rubrica.findFirst({
    where: { id: rubricaId, colegioId: user.colegioId, eliminadaEn: null },
    select: {
      nombre: true,
      descripcion: true,
      tipo: true,
      estado: true,
      version: true,
      asignatura: {
        select: {
          nombre: true,
          docenteId: true,
          curso: { select: { nivel: true, letra: true, profesorJefeId: true } },
        },
      },
      colegio: { select: { nombre: true } },
      criterios: {
        orderBy: { orden: "asc" },
        select: {
          descripcion: true,
          puntajeMax: true,
          niveles: {
            orderBy: { orden: "asc" },
            select: { etiqueta: true, descriptor: true, puntaje: true },
          },
        },
      },
    },
  });
  if (!rubrica) return new Response("No encontrada", { status: 404 });
  if (
    !autorizarLecturaRubrica(
      user.rol,
      user.id,
      rubrica.asignatura
        ? {
            docenteId: rubrica.asignatura.docenteId,
            curso: { profesorJefeId: rubrica.asignatura.curso.profesorJefeId },
          }
        : null,
      rubrica.estado
    )
  ) {
    return new Response("Sin acceso", { status: 403 });
  }

  const esPauta = rubrica.tipo === "PAUTA_COTEJO";
  const maxNiveles = Math.max(...rubrica.criterios.map((c) => c.niveles.length), 1);
  const e = escaparHtml;

  const filas = rubrica.criterios
    .map((c) => {
      const celdas = c.niveles
        .map(
          (n) =>
            `<td style="border:1px solid #999;padding:6pt;vertical-align:top">
              <b>${e(n.etiqueta)}</b> (${Number(n.puntaje)} pts)<br/>${e(n.descriptor)}
            </td>`
        )
        .join("");
      const relleno = "<td style='border:1px solid #999'></td>".repeat(
        maxNiveles - c.niveles.length
      );
      return `<tr>
        <td style="border:1px solid #999;padding:6pt;vertical-align:top;background:#f3f0fa"><b>${e(c.descripcion)}</b><br/><span style="color:#666">Puntaje máx.: ${Number(c.puntajeMax)}</span></td>
        ${celdas}${relleno}
      </tr>`;
    })
    .join("");

  const encabezadosNiveles = esPauta
    ? "<th style='border:1px solid #999;padding:6pt;background:#6d3fd4;color:#fff'>Sí</th><th style='border:1px solid #999;padding:6pt;background:#6d3fd4;color:#fff'>No</th>"
    : Array.from({ length: maxNiveles })
        .map(
          (_, i) =>
            `<th style='border:1px solid #999;padding:6pt;background:#6d3fd4;color:#fff'>Nivel ${i + 1}</th>`
        )
        .join("");

  const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><title>${e(rubrica.nombre)}</title></head>
<body style="font-family:Calibri,Arial,sans-serif;font-size:11pt">
  <h1 style="font-size:16pt;color:#2a2150;margin-bottom:2pt">${e(rubrica.nombre)}</h1>
  <p style="color:#555;margin-top:0">
    ${esPauta ? "Pauta de cotejo" : "Rúbrica por niveles de desempeño"} · versión ${rubrica.version}
    ${rubrica.asignatura ? ` · ${e(rubrica.asignatura.nombre)} (${rubrica.asignatura.curso.nivel}º ${e(rubrica.asignatura.curso.letra)})` : " · Institucional"}
    · ${e(rubrica.colegio.nombre)}
  </p>
  ${rubrica.descripcion ? `<p>${e(rubrica.descripcion)}</p>` : ""}
  <p><b>Estudiante:</b> ______________________________________ &nbsp;&nbsp; <b>Fecha:</b> ____________</p>
  <table style="border-collapse:collapse;width:100%">
    <tr><th style="border:1px solid #999;padding:6pt;background:#2a2150;color:#fff">Criterio</th>${encabezadosNiveles}</tr>
    ${filas}
  </table>
  <p style="margin-top:12pt"><b>Puntaje obtenido:</b> ________ &nbsp;&nbsp; <b>Nota:</b> ________</p>
  <p style="color:#999;font-size:9pt;margin-top:18pt">Generado con Aulia · aulia.cl</p>
</body></html>`;

  const nombreArchivo = `${rubrica.nombre.replace(/[^\p{L}\p{N} _-]/gu, "").slice(0, 60) || "rubrica"}.doc`;
  return new Response(html, {
    headers: {
      "Content-Type": "application/msword; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nombreArchivo}"`,
    },
  });
}
