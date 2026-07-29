import { beforeEach, describe, expect, it, vi } from "vitest";

const { sesion, prismaMock, txMock } = vi.hoisted(() => {
  const tx = {
    solicitudTitular: { create: vi.fn(), updateMany: vi.fn() },
    eventoSolicitudTitular: { create: vi.fn() },
    auditLog: { create: vi.fn() },
  };
  return {
    sesion: { user: { id: "usr_1", rol: "APODERADO", colegioId: "col_1" } },
    txMock: tx,
    prismaMock: {
      solicitudTitular: { findFirst: vi.fn() },
      $transaction: vi.fn(async (cb: (cliente: typeof tx) => Promise<unknown>) => cb(tx)),
    },
  };
});

vi.mock("@/lib/sesion", () => ({ requerirSesion: vi.fn(async () => sesion) }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { actualizarSolicitudPrivacidad, crearSolicitudPrivacidad } from "./actions";

beforeEach(() => {
  vi.clearAllMocks();
  sesion.user.id = "usr_1";
  sesion.user.rol = "APODERADO";
  sesion.user.colegioId = "col_1";
  txMock.solicitudTitular.create.mockResolvedValue({ id: "sol_1", tipo: "ACCESO" });
  txMock.solicitudTitular.updateMany.mockResolvedValue({ count: 1 });
  txMock.eventoSolicitudTitular.create.mockResolvedValue({ id: "evt_1" });
  txMock.auditLog.create.mockResolvedValue({ id: 1n });
  prismaMock.solicitudTitular.findFirst.mockResolvedValue({ id: "sol_1", estado: "RECIBIDA", tipo: "ACCESO" });
});

describe("solicitudes de privacidad", () => {
  it("permite al titular crear una solicitud en su colegio con evento y auditoría", async () => {
    const resultado = await crearSolicitudPrivacidad({ tipo: "ACCESO", descripcion: "Solicito conocer los datos que mantienen de mi cuenta." });

    expect(resultado).toEqual({ ok: true, id: "sol_1" });
    expect(txMock.solicitudTitular.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ colegioId: "col_1", titularUsuarioId: "usr_1", tipo: "ACCESO" }),
    }));
    expect(txMock.auditLog.create).toHaveBeenCalledOnce();
  });

  it("impide que un rol no autorizado gestione solicitudes", async () => {
    const resultado = await actualizarSolicitudPrivacidad({ solicitudId: "sol_1", estado: "EN_PROCESO", nota: "Iniciamos la revisión de identidad." });

    expect(resultado.ok).toBe(false);
    expect(prismaMock.solicitudTitular.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("un director solo gestiona solicitudes pertenecientes a su colegio", async () => {
    sesion.user.rol = "DIRECTOR";
    prismaMock.solicitudTitular.findFirst.mockResolvedValue(null);

    const resultado = await actualizarSolicitudPrivacidad({ solicitudId: "sol_otro", estado: "EN_PROCESO", nota: "Iniciamos la revisión de identidad." });

    expect(resultado.ok).toBe(false);
    expect(prismaMock.solicitudTitular.findFirst).toHaveBeenCalledWith({
      where: { id: "sol_otro", colegioId: "col_1" },
      select: { id: true, estado: true, tipo: true },
    });
  });
});
