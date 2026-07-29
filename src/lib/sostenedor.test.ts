import { describe, it, expect, vi, beforeEach } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    colegio: { findMany: vi.fn() },
    anioEscolar: { findFirst: vi.fn() },
    matricula: { count: vi.fn() },
    asistenciaDiaria: { groupBy: vi.fn() },
    calificacion: { aggregate: vi.fn() },
    intervencion: { count: vi.fn() },
    cuota: { groupBy: vi.fn() },
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { metricasRed } from "./sostenedor";

beforeEach(() => {
  vi.clearAllMocks();
  // Por defecto: cada colegio tiene un año escolar vigente 2026.
  prismaMock.anioEscolar.findFirst.mockResolvedValue({ id: "ae_2026", anio: 2026 });
});

describe("metricasRed — multi-tenant y agregación", () => {
  it("con red vacía no consulta la BD y devuelve []", async () => {
    const r = await metricasRed([]);
    expect(r).toEqual([]);
    expect(prismaMock.colegio.findMany).not.toHaveBeenCalled();
  });

  it("solo consulta los colegios indicados (nunca todos)", async () => {
    prismaMock.colegio.findMany.mockResolvedValue([]);
    await metricasRed(["c1", "c2"]);
    expect(prismaMock.colegio.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ["c1", "c2"] } } })
    );
  });

  it("calcula asistencia, promedio y recaudación por colegio", async () => {
    prismaMock.colegio.findMany.mockResolvedValue([{ id: "c1", nombre: "Colegio Uno" }]);
    prismaMock.matricula.count.mockResolvedValue(120);
    prismaMock.asistenciaDiaria.groupBy.mockResolvedValue([
      { estado: "PRESENTE", _count: { _all: 85 } },
      { estado: "ATRASADO", _count: { _all: 5 } },
      { estado: "AUSENTE", _count: { _all: 10 } },
    ]);
    prismaMock.calificacion.aggregate.mockResolvedValue({ _avg: { nota: 5.834 } });
    prismaMock.intervencion.count.mockResolvedValue(3);
    prismaMock.cuota.groupBy.mockResolvedValue([
      { estado: "PAGADA", _sum: { monto: 700000 } },
      { estado: "PENDIENTE", _sum: { monto: 300000 } },
    ]);

    const [m] = await metricasRed(["c1"]);
    expect(m.nombre).toBe("Colegio Uno");
    expect(m.estudiantes).toBe(120);
    expect(m.asistenciaMedia).toBe(90); // (85+5)/100
    expect(m.promedioGeneral).toBe(5.8); // redondeo a un decimal
    expect(m.intervencionesAbiertas).toBe(3);
    expect(m.recaudacionPct).toBe(70); // 700000 / 1000000
  });

  it("tolera colegios sin datos (asistencia/promedio/recaudación nulos)", async () => {
    prismaMock.colegio.findMany.mockResolvedValue([{ id: "c1", nombre: "Nuevo" }]);
    prismaMock.matricula.count.mockResolvedValue(0);
    prismaMock.asistenciaDiaria.groupBy.mockResolvedValue([]);
    prismaMock.calificacion.aggregate.mockResolvedValue({ _avg: { nota: null } });
    prismaMock.intervencion.count.mockResolvedValue(0);
    prismaMock.cuota.groupBy.mockResolvedValue([]);

    const [m] = await metricasRed(["c1"]);
    expect(m.asistenciaMedia).toBeNull();
    expect(m.promedioGeneral).toBeNull();
    expect(m.recaudacionPct).toBeNull();
  });

  it("acota asistencia, notas y recaudación al año escolar vigente", async () => {
    prismaMock.colegio.findMany.mockResolvedValue([{ id: "c1", nombre: "Colegio Uno" }]);
    prismaMock.anioEscolar.findFirst.mockResolvedValue({ id: "ae_2026", anio: 2026 });
    prismaMock.matricula.count.mockResolvedValue(50);
    prismaMock.asistenciaDiaria.groupBy.mockResolvedValue([]);
    prismaMock.calificacion.aggregate.mockResolvedValue({ _avg: { nota: null } });
    prismaMock.intervencion.count.mockResolvedValue(0);
    prismaMock.cuota.groupBy.mockResolvedValue([]);

    await metricasRed(["c1"]);

    // Asistencia y cuotas acotadas al rango [2026-01-01, 2027-01-01).
    const desde = new Date(Date.UTC(2026, 0, 1));
    const hasta = new Date(Date.UTC(2027, 0, 1));
    expect(prismaMock.asistenciaDiaria.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ colegioId: "c1", fecha: { gte: desde, lt: hasta } }) })
    );
    expect(prismaMock.cuota.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ vencimiento: { gte: desde, lt: hasta } }) })
    );
    // Matrícula y notas acotadas por el curso del año vigente.
    expect(prismaMock.matricula.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ curso: { anioEscolarId: "ae_2026" } }) })
    );
    const calArg = prismaMock.calificacion.aggregate.mock.calls[0][0];
    expect(calArg.where.evaluacion.asignatura.curso.anioEscolarId).toBe("ae_2026");
  });

  it("un colegio sin año escolar configurado no rompe y devuelve métricas vacías", async () => {
    prismaMock.colegio.findMany.mockResolvedValue([{ id: "c1", nombre: "Sin Año" }]);
    prismaMock.anioEscolar.findFirst.mockResolvedValue(null);

    const [m] = await metricasRed(["c1"]);
    expect(m).toEqual({
      colegioId: "c1",
      nombre: "Sin Año",
      estudiantes: 0,
      asistenciaMedia: null,
      promedioGeneral: null,
      intervencionesAbiertas: 0,
      recaudacionPct: null,
    });
    // No debe consultar métricas si no hay año escolar.
    expect(prismaMock.asistenciaDiaria.groupBy).not.toHaveBeenCalled();
  });
});
