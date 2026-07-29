/**
 * Siembra ADITIVA e IDEMPOTENTE para que el demo luzca las herramientas nuevas:
 *  - Calendario escolar: eventos del colegio (reuniones, efemérides, suspensión).
 *  - "Próximas evaluaciones" del apoderado: 2 evaluaciones con fecha futura para
 *    el curso del pupilo de apoderado1@demo.cl.
 *
 * No borra nada; si ya hay eventos / evaluaciones futuras, no las duplica.
 * Fechas ancladas a jul–sep 2026 (ventana del colegio demo).
 *
 * Ejecutar:  npx tsx --env-file=.env prisma/seed-calendario-demo.ts
 */
import { PrismaClient, TipoEvento } from "@prisma/client";

const prisma = new PrismaClient();

/** Día-solo a medianoche UTC (convención de columnas @db.Date del proyecto). */
const fecha = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

async function main() {
  const colegio = await prisma.colegio.findFirst({ select: { id: true } });
  if (!colegio) {
    console.log("No hay colegio demo. Corre primero el seed principal.");
    return;
  }
  const colegioId = colegio.id;

  const director = await prisma.usuario.findFirst({
    where: { email: "director@demo.cl" },
    select: { id: true },
  });
  const creadoPorId = director?.id;
  if (!creadoPorId) {
    console.log("No se encontró director@demo.cl para atribuir los eventos.");
    return;
  }

  // ── Eventos del calendario escolar ────────────────────────────────────
  const yaHayEventos = await prisma.eventoEscolar.count({ where: { colegioId } });
  if (yaHayEventos > 0) {
    console.log(`Ya hay ${yaHayEventos} evento(s); no se siembran eventos.`);
  } else {
    const eventos: { titulo: string; fecha: string; tipo: TipoEvento; descripcion?: string }[] = [
      { titulo: "Reunión de apoderados 1° a 4° básico", fecha: "2026-07-23", tipo: TipoEvento.REUNION, descripcion: "18:30 hrs en cada sala. Entrega de informes parciales." },
      { titulo: "Consejo de profesores", fecha: "2026-08-06", tipo: TipoEvento.REUNION },
      { titulo: "Día del Alumno", fecha: "2026-07-28", tipo: TipoEvento.EFEMERIDE, descripcion: "Actividades recreativas durante la jornada." },
      { titulo: "Aniversario del colegio", fecha: "2026-08-14", tipo: TipoEvento.EFEMERIDE },
      { titulo: "Suspensión de clases — Fiestas Patrias", fecha: "2026-09-17", tipo: TipoEvento.SUSPENSION },
      { titulo: "Fiestas Patrias", fecha: "2026-09-18", tipo: TipoEvento.EFEMERIDE },
    ];
    for (const e of eventos) {
      await prisma.eventoEscolar.create({
        data: {
          colegioId,
          titulo: e.titulo,
          descripcion: e.descripcion ?? null,
          fecha: fecha(e.fecha),
          tipo: e.tipo,
          creadoPorId,
        },
      });
    }
    console.log(`Sembrados ${eventos.length} eventos del calendario escolar.`);
  }

  // ── Evaluaciones futuras para el pupilo de apoderado1 ─────────────────
  const pupilo = await prisma.estudiante.findFirst({
    where: { colegioId, apoderados: { some: { usuario: { email: "apoderado1@demo.cl" } } } },
    select: {
      nombres: true,
      matriculas: {
        where: { estado: "ACTIVA" },
        select: { cursoId: true },
        take: 1,
      },
    },
  });
  const cursoId = pupilo?.matriculas[0]?.cursoId;
  if (!cursoId) {
    console.log("No se encontró el curso del pupilo de apoderado1; sin evaluaciones futuras.");
    return;
  }

  const asignaturas = await prisma.asignatura.findMany({
    where: { colegioId, cursoId },
    select: { id: true, nombre: true },
    orderBy: { nombre: "asc" },
  });
  if (asignaturas.length === 0) {
    console.log("El curso del pupilo no tiene asignaturas; sin evaluaciones futuras.");
    return;
  }

  const hoy = fecha(new Date().toISOString().slice(0, 10));
  const yaFuturas = await prisma.evaluacion.count({
    where: { colegioId, asignatura: { cursoId }, eliminadaEn: null, fecha: { gte: hoy } },
  });
  if (yaFuturas > 0) {
    console.log(`El curso del pupilo ya tiene ${yaFuturas} evaluación(es) futura(s); no se siembran.`);
    return;
  }

  const futuras = [
    { asignatura: asignaturas[0], nombre: "Prueba de unidad", fecha: "2026-07-24" },
    { asignatura: asignaturas[Math.min(1, asignaturas.length - 1)], nombre: "Control de lectura", fecha: "2026-07-31" },
  ];
  for (const f of futuras) {
    await prisma.evaluacion.create({
      data: {
        colegioId,
        asignaturaId: f.asignatura.id,
        nombre: f.nombre,
        tipo: "SUMATIVA",
        periodo: 2,
        fecha: fecha(f.fecha),
      },
    });
  }
  console.log(
    `Sembradas ${futuras.length} evaluaciones futuras para el curso de ${pupilo?.nombres?.split(" ")[0] ?? "el pupilo"}.`
  );
}

main().finally(() => prisma.$disconnect());
