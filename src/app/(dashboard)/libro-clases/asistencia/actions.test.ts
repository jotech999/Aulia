import { beforeEach, describe, expect, it, vi } from "vitest";

const { sesion, prismaMock, txMock, auditoriaMock } = vi.hoisted(() => {
  const tx = {
    operacionIdempotente: { create: vi.fn(), update: vi.fn() },
    asistenciaDiaria: { findMany: vi.fn(), upsert: vi.fn(), update: vi.fn() },
    bloqueHorario: { findFirst: vi.fn() },
    eventoEscolar: { findFirst: vi.fn() },
    justificacionInasistencia: { findMany: vi.fn(), updateMany: vi.fn() },
    eventoJustificacion: { create: vi.fn() },
  };
  return {
    sesion: { user: { id: "doc_1", rol: "PROFESOR", colegioId: "col_1", membresiaId: "mem_1" } },
    txMock: tx,
    auditoriaMock: vi.fn(),
    prismaMock: {
      curso: { findFirst: vi.fn() },
      operacionIdempotente: { findUnique: vi.fn() },
      $transaction: vi.fn(async (cb: (cliente: typeof tx) => Promise<unknown>) => cb(tx)),
    },
  };
});

vi.mock("@/lib/sesion", () => ({ requerirSesion: vi.fn(async () => sesion) }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auditoria", () => ({ registrarAuditoria: auditoriaMock }));
vi.mock("@/lib/notificaciones", () => ({ notificarApoderadosDeEstudiante: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { guardarAsistencia } from "./actions";

const entrada = {
  cursoId: "curso_1",
  fecha: "2026-03-10",
  marcas: [{ estudianteId: "est_1", estado: "PRESENTE" as const }],
  versionBase: new Date(0).toISOString(),
};

beforeEach(() => {
  vi.clearAllMocks();
  sesion.user.id = "doc_1";
  sesion.user.rol = "PROFESOR";
  sesion.user.colegioId = "col_1";
  prismaMock.curso.findFirst.mockResolvedValue({
    id: "curso_1",
    profesorJefeId: null,
    asignaturas: [{ docenteId: "doc_1" }],
    matriculas: [{ estudianteId: "est_1" }],
    anioEscolar: { anio: 2026 },
  });
  prismaMock.operacionIdempotente.findUnique.mockResolvedValue(null);
  txMock.asistenciaDiaria.findMany.mockResolvedValue([]);
  txMock.asistenciaDiaria.upsert.mockResolvedValue({ id: "asis_1" });
  txMock.bloqueHorario.findFirst.mockResolvedValue({ id: "bloque_1" });
  txMock.eventoEscolar.findFirst.mockResolvedValue(null);
  txMock.justificacionInasistencia.findMany.mockResolvedValue([]);
  txMock.justificacionInasistencia.updateMany.mockResolvedValue({ count: 1 });
  txMock.operacionIdempotente.create.mockResolvedValue({ id: "op_1" });
  txMock.operacionIdempotente.update.mockResolvedValue({ id: "op_1" });
});

describe("guardarAsistencia", () => {
  it("crea asistencia y auditoría en una transacción serializable", async () => {
    const resultado = await guardarAsistencia(entrada);

    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.creados).toBe(1);
      expect(resultado.version).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
    expect(prismaMock.$transaction).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({ isolationLevel: "Serializable" }));
    expect(txMock.asistenciaDiaria.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ colegioId: "col_1", estudianteId: "est_1", registradoPorId: "doc_1" }),
    }));
    expect(auditoriaMock).toHaveBeenCalledOnce();
  });

  it("rechaza a un docente que no pertenece al curso", async () => {
    prismaMock.curso.findFirst.mockResolvedValue({
      id: "curso_1",
      profesorJefeId: "otro",
      asignaturas: [{ docenteId: "otro" }],
      matriculas: [{ estudianteId: "est_1" }],
      anioEscolar: { anio: 2026 },
    });

    const resultado = await guardarAsistencia(entrada);

    expect(resultado.ok).toBe(false);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("rechaza el lote completo si contiene un estudiante ajeno", async () => {
    const resultado = await guardarAsistencia({ ...entrada, marcas: [...entrada.marcas, { estudianteId: "est_otro", estado: "AUSENTE" }] });

    expect(resultado.ok).toBe(false);
    expect(txMock.asistenciaDiaria.upsert).not.toHaveBeenCalled();
  });

  it("detecta una actualización concurrente usando la versión base", async () => {
    txMock.asistenciaDiaria.findMany.mockResolvedValue([{ id: "asis_1", estudianteId: "est_1", estado: "PRESENTE", actualizadoEn: new Date("2026-03-10T15:00:00Z") }]);

    const resultado = await guardarAsistencia({ ...entrada, versionBase: "2026-03-10T14:00:00.000Z" });

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.conflicto).toBe(true);
    expect(txMock.asistenciaDiaria.update).not.toHaveBeenCalled();
  });

  it("rechaza clientes que omiten la versión base", async () => {
    const { versionBase: _omitida, ...sinVersion } = entrada;

    const resultado = await guardarAsistencia(sinVersion);

    expect(resultado.ok).toBe(false);
    expect(prismaMock.curso.findFirst).not.toHaveBeenCalled();
  });

  it("anula la justificación si la ausencia se corrige", async () => {
    txMock.asistenciaDiaria.findMany.mockResolvedValue([{ id: "asis_1", estudianteId: "est_1", estado: "AUSENTE", actualizadoEn: new Date("2026-03-10T12:00:00Z") }]);
    txMock.justificacionInasistencia.findMany.mockResolvedValue([{ id: "just_1", estado: "APROBADA" }]);

    const resultado = await guardarAsistencia({ ...entrada, versionBase: "2026-03-10T13:00:00.000Z" });

    expect(resultado.ok).toBe(true);
    expect(txMock.justificacionInasistencia.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: "just_1", colegioId: "col_1", estado: "APROBADA" }),
      data: expect.objectContaining({ estado: "ANULADA", anuladaPorId: "doc_1" }),
    }));
    expect(txMock.eventoJustificacion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ justificacionId: "just_1", estadoAnterior: "APROBADA", estadoNuevo: "ANULADA" }),
    });
  });
});
