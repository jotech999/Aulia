import Link from "next/link";
import { nombreCurso, ordenarCursos } from "@/lib/cursos";
import { prisma } from "@/lib/prisma";
import { requerirRol } from "@/lib/sesion";
import { hoyEnSantiago, fechaDesdeISO, formatearFechaLarga } from "@/lib/fecha";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import { Insignia } from "@/components/ui/insignia";

// Antes había acá un `nombreCurso` local que mostraba el código interno tal cual
// ("1B A", "1M A"). El resto de la plataforma dice "1° básico A" y "I medio A";
// esta pantalla era la única que hablaba en códigos de base de datos.

export default async function AsistenciaHoyPage() {
  // Seguimiento de la jornada: tarea de dirección/UTP/admin.
  // INSPECTOR incluido: "qué cursos no han pasado lista hoy" es su función central
  // y su propio panel enlaza acá como acción principal. La pantalla muestra solo
  // estado de registro por curso: sin calificaciones ni datos sensibles.
  const { user } = await requerirRol("ADMIN", "DIRECTOR", "UTP", "INSPECTOR");
  const hoy = hoyEnSantiago();

  const [cursos, marcasHoy] = await Promise.all([
    prisma.curso.findMany({
      where: { colegioId: user.colegioId },
      select: {
        id: true,
        nivel: true,
        letra: true,
        profesorJefe: { select: { nombre: true } },
        matriculas: { where: { estado: "ACTIVA" }, select: { estudianteId: true } },
      },
      // El orden real lo aplica ordenarCursos(): "nivel" es texto y ordenado
      // alfabéticamente intercala la media entre la básica.
      orderBy: [{ nivel: "asc" }, { letra: "asc" }],
    }),
    // Estudiantes con asistencia registrada hoy (una fila por estudiante).
    prisma.asistenciaDiaria.findMany({
      where: { colegioId: user.colegioId, fecha: fechaDesdeISO(hoy) },
      select: { estudianteId: true },
      distinct: ["estudianteId"],
    }),
  ]);

  const conMarca = new Set(marcasHoy.map((m) => m.estudianteId));

  const filas = ordenarCursos(cursos)
    .map((c) => {
      const total = c.matriculas.length;
      const tomadas = c.matriculas.filter((m) => conMarca.has(m.estudianteId)).length;
      return {
        id: c.id,
        nombre: nombreCurso(c),
        jefe: c.profesorJefe?.nombre ?? null,
        total,
        tomadas,
        completa: total > 0 && tomadas >= total,
        pendiente: tomadas === 0,
      };
    })
    // Pendientes primero (lo que requiere seguimiento), luego parciales, luego completas.
    .sort((a, b) => Number(a.completa) - Number(b.completa) || a.nombre.localeCompare(b.nombre));

  const conCursos = filas.filter((f) => f.total > 0);
  const completas = conCursos.filter((f) => f.completa).length;
  const pendientes = conCursos.filter((f) => f.pendiente).length;

  return (
    <div>
      <EncabezadoPagina
        icono="asistencia"
        titulo="Asistencia de hoy"
        descripcion={`Seguimiento de la jornada · ${formatearFechaLarga(hoy)}`}
      />

      {conCursos.length === 0 ? (
        <EstadoVacio
          icono="asistencia"
          titulo="Sin cursos con matrícula activa"
          descripcion="Cuando haya cursos con estudiantes, aquí verás el avance de la asistencia del día."
        />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-3">
            <div className="superficie flex-1 rounded-xl p-4">
              <p className="font-display text-3xl font-bold tabular-nums text-exito">{completas}</p>
              <p className="text-xs text-tinta-tenue">cursos con asistencia tomada</p>
            </div>
            <div className="superficie flex-1 rounded-xl p-4">
              <p className="font-display text-3xl font-bold tabular-nums text-alerta">{pendientes}</p>
              <p className="text-xs text-tinta-tenue">cursos pendientes</p>
            </div>
          </div>

          <ul className="overflow-hidden rounded-xl border border-borde bg-superficie shadow-suave">
            {conCursos.map((f) => (
              <li key={f.id} className="border-b border-borde last:border-0">
                <Link
                  href="/libro-clases/asistencia"
                  className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-superficie-2"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-tinta">{f.nombre}</p>
                    <p className="truncate text-xs text-tinta-tenue">
                      {f.jefe ?? "Sin profesor jefe"} · {f.total} estudiantes
                    </p>
                  </div>
                  {f.completa ? (
                    <Insignia tono="exito" punto>Tomada</Insignia>
                  ) : f.pendiente ? (
                    <Insignia tono="alerta" punto>Pendiente</Insignia>
                  ) : (
                    <span className="shrink-0 rounded-full bg-marca-50 px-2.5 py-1 text-xs font-semibold text-marca-700 tabular-nums">
                      {f.tomadas}/{f.total}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
