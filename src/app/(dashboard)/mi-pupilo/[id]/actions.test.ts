import { beforeEach, describe, expect, it, vi } from "vitest";

const { sesion, prismaMock, txMock } = vi.hoisted(() => {
  const tx = {
    $queryRaw: vi.fn(),
    justificacionInasistencia: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    eventoJustificacion: { create: vi.fn() },
    auditLog: { create: vi.fn() },
  };
  return {
    sesion: { user: { id: "ap1", rol: "APODERADO", colegioId: "col_1" } },
    txMock: tx,
    prismaMock: {
      estudiante: { findFirst: vi.fn() },
      $transaction: vi.fn(async (cb: (cliente: typeof tx) => Promise<unknown>) => cb(tx)),
    },
  };
});
vi.mock("@/lib/sesion", () => ({ requerirSesion: vi.fn(async () => sesion) }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { justificarInasistencia } from "./actions";

beforeEach(() => {
  vi.clearAllMocks();
  process.env.DATOS_SENSIBLES_KEY = "clave-pruebas-justificaciones";
  sesion.user.rol = "APODERADO";
  sesion.user.colegioId = "col_1";
  prismaMock.estudiante.findFirst.mockResolvedValue({ id: "est_1" });
  txMock.$queryRaw.mockResolvedValue([{ id: "a1" }]);
  txMock.justificacionInasistencia.findFirst.mockResolvedValue(null);
  txMock.justificacionInasistencia.create.mockResolvedValue({ id: "j1" });
  txMock.eventoJustificacion.create.mockResolvedValue({ id: "evento_1" });
  txMock.auditLog.create.mockResolvedValue({ id: 1n });
});

const base = { estudianteId: "est_1", fecha: "2026-07-18", motivo: "Salud" as const };

describe("justificarInasistencia — autorización y tenant", () => {
  it("un rol que no es apoderado no puede justificar", async () => {
    sesion.user.rol = "PROFESOR";

    const resultado = await justificarInasistencia(base);

    expect(resultado.ok).toBe(false);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("no justifica a un estudiante fuera de su colegio o que no es su pupilo", async () => {
    prismaMock.estudiante.findFirst.mockResolvedValue(null);

    const resultado = await justificarInasistencia(base);

    expect(resultado.ok).toBe(false);
    expect(prismaMock.estudiante.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "est_1",
          colegioId: "col_1",
          apoderados: { some: { usuarioId: "ap1" } },
        }),
      })
    );
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});

describe("justificarInasistencia — reglas", () => {
  it("rechaza un motivo inválido", async () => {
    const resultado = await justificarInasistencia({ ...base, motivo: "Vacaciones" });
    expect(resultado.ok).toBe(false);
  });

  it("no justifica si no hubo inasistencia ausente en el tenant", async () => {
    txMock.$queryRaw.mockResolvedValue([]);

    const resultado = await justificarInasistencia(base);

    expect(resultado.ok).toBe(false);
    expect(prismaMock.$transaction).toHaveBeenCalledOnce();
    expect(txMock.$queryRaw).toHaveBeenCalledOnce();
    expect(txMock.$queryRaw.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ values: expect.arrayContaining(["col_1", "est_1"]) })
    );
  });

  it("no duplica una justificación existente", async () => {
    txMock.justificacionInasistencia.findFirst.mockResolvedValue({ id: "prev" });

    const resultado = await justificarInasistencia(base);

    expect(resultado.ok).toBe(false);
    expect(txMock.justificacionInasistencia.create).not.toHaveBeenCalled();
  });
});

describe("justificarInasistencia — caso feliz", () => {
  it("crea justificación, evento inicial y auditoría en la misma transacción", async () => {
    const resultado = await justificarInasistencia(base);

    expect(resultado.ok).toBe(true);
    expect(prismaMock.$transaction).toHaveBeenCalledOnce();
    expect(txMock.justificacionInasistencia.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          colegioId: "col_1",
          estudianteId: "est_1",
          asistenciaDiariaId: "a1",
          motivo: expect.stringMatching(/^enc:v1:/),
          estado: "PENDIENTE",
          creadaPorId: "ap1",
        }),
      })
    );
    expect(txMock.eventoJustificacion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        colegioId: "col_1",
        justificacionId: "j1",
        estadoAnterior: null,
        estadoNuevo: "PENDIENTE",
        actorId: "ap1",
      }),
    });
    expect(txMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          colegioId: "col_1",
          usuarioId: "ap1",
          accion: "CREAR",
          entidad: "JustificacionInasistencia",
          entidadId: "j1",
        }),
      })
    );
  });
});
