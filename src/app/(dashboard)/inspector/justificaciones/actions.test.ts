import { beforeEach, describe, expect, it, vi } from "vitest";

const { sesion, prismaMock, txMock } = vi.hoisted(() => {
  const tx = {
    justificacionInasistencia: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
    },
    eventoJustificacion: { create: vi.fn() },
    auditLog: { create: vi.fn() },
  };
  return {
    sesion: { user: { id: "ins_1", rol: "INSPECTOR", colegioId: "col_1" } },
    txMock: tx,
    prismaMock: {
      $transaction: vi.fn(async (cb: (cliente: typeof tx) => Promise<unknown>) => cb(tx)),
    },
  };
});

vi.mock("@/lib/sesion", () => ({ requerirSesion: vi.fn(async () => sesion) }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { revisarJustificacion } from "./actions";

beforeEach(() => {
  vi.clearAllMocks();
  process.env.DATOS_SENSIBLES_KEY = "clave-pruebas-revision";
  sesion.user.id = "ins_1";
  sesion.user.rol = "INSPECTOR";
  sesion.user.colegioId = "col_1";
  txMock.justificacionInasistencia.findFirst.mockResolvedValue({
    id: "j1",
    estudianteId: "est_1",
    estado: "PENDIENTE",
  });
  txMock.justificacionInasistencia.updateMany.mockResolvedValue({ count: 1 });
  txMock.eventoJustificacion.create.mockResolvedValue({ id: "evento_2" });
  txMock.auditLog.create.mockResolvedValue({ id: 2n });
});

describe("revisarJustificacion", () => {
  it("permite a Inspectoría aprobar y registra evento+auditoría sin cambiar asistencia", async () => {
    const resultado = await revisarJustificacion({ justificacionId: "j1", decision: "APROBADA" });

    expect(resultado.ok).toBe(true);
    expect(txMock.justificacionInasistencia.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "j1", colegioId: "col_1", estado: "PENDIENTE" },
        data: expect.objectContaining({
          estado: "APROBADA",
          revisadaPorId: "ins_1",
          fundamentoRevision: expect.stringMatching(/^enc:v1:/),
        }),
      })
    );
    expect(txMock.eventoJustificacion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        colegioId: "col_1",
        justificacionId: "j1",
        estadoAnterior: "PENDIENTE",
        estadoNuevo: "APROBADA",
        actorId: "ins_1",
      }),
    });
    expect(txMock.auditLog.create).toHaveBeenCalledOnce();
    expect("asistenciaDiaria" in txMock).toBe(false);
  });

  it("rechaza la decisión de un rol no autorizado", async () => {
    sesion.user.rol = "UTP";

    const resultado = await revisarJustificacion({ justificacionId: "j1", decision: "APROBADA" });

    expect(resultado.ok).toBe(false);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("exige fundamento al rechazar", async () => {
    const resultado = await revisarJustificacion({ justificacionId: "j1", decision: "RECHAZADA", fundamento: "" });

    expect(resultado.ok).toBe(false);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("rechaza fundamentos que incluyen datos de salud", async () => {
    const resultado = await revisarJustificacion({
      justificacionId: "j1",
      decision: "RECHAZADA",
      fundamento: "Se rechaza por su diagnóstico médico y medicamentos.",
    });

    expect(resultado.ok).toBe(false);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("no revisa una justificación de otro colegio", async () => {
    txMock.justificacionInasistencia.findFirst.mockResolvedValue(null);

    const resultado = await revisarJustificacion({ justificacionId: "j_otro", decision: "APROBADA" });

    expect(resultado.ok).toBe(false);
    expect(txMock.justificacionInasistencia.findFirst).toHaveBeenCalledWith({
      where: {
        id: "j_otro",
        colegioId: "col_1",
        estudiante: { colegioId: "col_1" },
      },
      select: { id: true, estudianteId: true, estado: true },
    });
    expect(txMock.justificacionInasistencia.updateMany).not.toHaveBeenCalled();
    expect(txMock.eventoJustificacion.create).not.toHaveBeenCalled();
  });

  it("rechaza una segunda revisión concurrente", async () => {
    txMock.justificacionInasistencia.updateMany.mockResolvedValue({ count: 0 });

    const resultado = await revisarJustificacion({ justificacionId: "j1", decision: "APROBADA" });

    expect(resultado.ok).toBe(false);
    expect(txMock.eventoJustificacion.create).not.toHaveBeenCalled();
    expect(txMock.auditLog.create).not.toHaveBeenCalled();
  });
});
