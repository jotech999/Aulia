import { requerirRol } from "@/lib/sesion";
import { construirCsv, respuestaCsv } from "@/lib/exportar";
import { PLANTILLAS, type TipoImportacion } from "@/lib/importar";

/**
 * Descarga la plantilla CSV para importar (encabezados + una fila de ejemplo).
 * Solo dirección/admin: la importación masiva es una acción administrativa.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ tipo: string }> }) {
  await requerirRol("ADMIN", "DIRECTOR");
  const { tipo } = await params;
  const plantilla = PLANTILLAS[tipo as TipoImportacion];
  if (!plantilla) return new Response("Plantilla no válida.", { status: 400 });

  const csv = construirCsv(plantilla.encabezados, [plantilla.ejemplo]);
  return respuestaCsv(`plantilla_${tipo}.csv`, csv);
}
