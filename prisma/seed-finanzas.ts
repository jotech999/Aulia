/** Seed idempotente de finanzas para la demo. No borra datos existentes. */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const colegio = await prisma.colegio.findFirst({ where: { rbd: "99999" }, select: { id: true } });
  if (!colegio) { console.log("Sin colegio demo"); return; }
  const colegioId = colegio.id;
  const ANIO = 2026;

  const plan = await prisma.planCobro.upsert({
    where: { colegioId_anio: { colegioId, anio: ANIO } },
    update: {},
    create: { colegioId, anio: ANIO, matricula: 120000, arancelAnual: 1400000, cuotas: 10 },
  });

  // Cuotas del plan (matrícula + 10 mensualidades desde marzo).
  const iso = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
  const calendario: { concepto: "MATRICULA" | "MENSUALIDAD"; numero: number; monto: number; venc: Date }[] = [];
  calendario.push({ concepto: "MATRICULA", numero: 0, monto: plan.matricula, venc: iso(ANIO, 3, 10) });
  const base = Math.floor(plan.arancelAnual / plan.cuotas);
  const resto = plan.arancelAnual - base * plan.cuotas;
  for (let i = 0; i < plan.cuotas; i++) {
    const mes = 3 + i;
    const y = ANIO + Math.floor((mes - 1) / 12);
    const mReal = ((mes - 1) % 12) + 1;
    calendario.push({ concepto: "MENSUALIDAD", numero: i + 1, monto: i === 0 ? base + resto : base, venc: iso(y, mReal, 5) });
  }

  // Genera para 5B y 6B (idempotente por estudiante).
  const estudiantes = await prisma.estudiante.findMany({
    where: { colegioId, matriculas: { some: { estado: "ACTIVA", curso: { nivel: { in: ["5B", "6B"] } } } } },
    select: { id: true },
  });
  let creadas = 0;
  for (const e of estudiantes) {
    const tiene = await prisma.cuota.count({ where: { colegioId, estudianteId: e.id } });
    if (tiene > 0) continue;
    await prisma.cuota.createMany({
      data: calendario.map((c) => ({ colegioId, estudianteId: e.id, concepto: c.concepto, numero: c.numero, monto: c.monto, vencimiento: c.venc })),
    });
    creadas += calendario.length;
  }
  // Marca algunas cuotas como pagadas para que el resumen no sea 0 (matrícula + marzo).
  const pagables = await prisma.cuota.findMany({ where: { colegioId, concepto: "MATRICULA" }, select: { id: true, estudianteId: true, monto: true }, take: 15 });
  for (const c of pagables) {
    if (Math.random() < 0.6) {
      await prisma.cuota.update({ where: { id: c.id }, data: { estado: "PAGADA" } }).catch(()=>{});
      await prisma.pago.create({ data: { colegioId, cuotaId: c.id, estudianteId: c.estudianteId, monto: c.monto, medio: "TRANSFERENCIA", estado: "CONFIRMADO" } }).catch(()=>{});
    }
  }
  console.log(`Finanzas: plan ${ANIO} · cuotas nuevas: ${creadas} · estudiantes: ${estudiantes.length}`);
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
