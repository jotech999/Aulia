import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, txMock } = vi.hoisted(() => {
  const tx = {
    trabajoOutbox: { updateMany: vi.fn(), update: vi.fn() },
    accesoEstudiante: { findFirst: vi.fn(), updateMany: vi.fn() },
    membresia: { updateMany: vi.fn() },
    auditLog: { create: vi.fn() },
  };
  return {
    txMock: tx,
    prismaMock: {
      trabajoOutbox: { findFirst: vi.fn() },
      $transaction: vi.fn(async (cb: (cliente: typeof tx) => Promise<unknown>) => cb(tx)),
    },
  };
});

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { activarPortalEstudiante } from "./actions";

const token = "token-secreto-de-prueba";

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.trabajoOutbox.findFirst.mockResolvedValue({
    id: "inv_1",
    colegioId: "col_1",
    agregadoId: "acc_1",
    payloadMinimo: { tokenHash: createHash("sha256").update(token).digest("hex"), usuarioId: "usr_est", membresiaId: "mem_est", expiraEn: "2099-01-01T00:00:00.000Z" },
  });
  txMock.trabajoOutbox.updateMany.mockResolvedValue({ count: 1 });
  txMock.accesoEstudiante.findFirst.mockResolvedValue({ id: "acc_1", estudianteId: "est_1" });
  txMock.membresia.updateMany.mockResolvedValue({ count: 1 });
  txMock.accesoEstudiante.updateMany.mockResolvedValue({ count: 1 });
  txMock.trabajoOutbox.update.mockResolvedValue({ id: "inv_1" });
  txMock.auditLog.create.mockResolvedValue({ id: 1n });
});

describe("activarPortalEstudiante", () => {
  it("activa una invitación válida una sola vez y audita", async () => {
    const resultado = await activarPortalEstudiante(`inv_1.${token}`);
    expect(resultado.ok).toBe(true);
    expect(txMock.trabajoOutbox.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ estado: "PENDIENTE", colegioId: "col_1" }), data: expect.objectContaining({ estado: "PROCESANDO" }) }));
    expect(txMock.membresia.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { activa: true } }));
    expect(txMock.accesoEstudiante.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { activo: true } }));
    expect(txMock.auditLog.create).toHaveBeenCalledOnce();
  });

  it("rechaza un token incorrecto sin revelar ni mutar el acceso", async () => {
    const resultado = await activarPortalEstudiante("inv_1.otro-token");
    expect(resultado.ok).toBe(false);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});
