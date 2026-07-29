/**
 * Siembra ADITIVA e IDEMPOTENTE de una planificación clase-a-clase de ejemplo,
 * para que el demo muestre la Fase 2 (vista anidada + "copiar desde el plan" en
 * la firma). No borra nada; si ya hay clases planificadas, no hace nada.
 *
 * Ejecutar:  npx tsx --env-file=.env prisma/seed-planificacion-demo.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const asig = await prisma.asignatura.findFirst({
    where: {
      docente: { email: "cvargas@demo.cl" },
      nombre: { contains: "Lenguaje" },
    },
    select: { id: true, colegioId: true, docenteId: true, nombre: true },
  });
  if (!asig || !asig.docenteId) {
    console.log("No se encontró la asignatura de Lenguaje de cvargas@demo.cl.");
    return;
  }

  const yaTiene = await prisma.planificacion.count({
    where: { asignaturaId: asig.id, tipo: "CLASE", eliminadaEn: null },
  });
  if (yaTiene > 0) {
    console.log(`Ya hay ${yaTiene} clase(s) planificada(s); no se siembra.`);
    return;
  }

  const unidad = await prisma.planificacion.create({
    data: {
      colegioId: asig.colegioId,
      asignaturaId: asig.id,
      tipo: "UNIDAD",
      autorId: asig.docenteId,
      titulo: "Unidad 1: Comprensión de lectura",
      descripcion:
        "Leer y comprender textos narrativos simples; ampliar vocabulario.",
    },
  });

  const clases = [
    {
      titulo: "Clase 1: Las palabras tienen un orden",
      descripcion:
        "Orden alfabético. Lectura del abecedario y ordenar palabras según la primera letra.",
    },
    {
      titulo: "Clase 2: Personajes de un cuento",
      descripcion:
        "Identificar personajes principales y secundarios en un texto narrativo.",
    },
    {
      titulo: "Clase 3: Secuencia de hechos",
      descripcion:
        "Ordenar los hechos de un cuento: inicio, desarrollo y final.",
    },
    {
      titulo: "Clase 4: Ampliamos vocabulario",
      descripcion:
        "Usar sinónimos en oraciones simples para mejorar la comprensión.",
    },
  ];

  for (const c of clases) {
    await prisma.planificacion.create({
      data: {
        colegioId: asig.colegioId,
        asignaturaId: asig.id,
        tipo: "CLASE",
        padreId: unidad.id,
        autorId: asig.docenteId,
        titulo: c.titulo,
        descripcion: c.descripcion,
      },
    });
  }

  console.log(
    `Sembradas 1 unidad + ${clases.length} clases planificadas para "${asig.nombre}".`
  );
}

main().finally(() => prisma.$disconnect());
