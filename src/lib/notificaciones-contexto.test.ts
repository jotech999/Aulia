import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    notificacion: {
      count: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { contarNoLeidas, listarNotificaciones, marcarTodasLeidas } from "./notificaciones";

beforeEach(() => vi.clearAllMocks());

describe("notificaciones en contexto multi-colegio", () => {
  it("cuenta y lista únicamente las del colegio activo", async () => {
    prismaMock.notificacion.count.mockResolvedValue(2);
    prismaMock.notificacion.findMany.mockResolvedValue([]);

    await contarNoLeidas("usr_1", "col_1");
    await listarNotificaciones("usr_1", "col_1");

    expect(prismaMock.notificacion.count).toHaveBeenCalledWith({ where: { usuarioId: "usr_1", colegioId: "col_1", leidaEn: null } });
    expect(prismaMock.notificacion.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { usuarioId: "usr_1", colegioId: "col_1" } }));
  });

  it("marca leídas sin tocar las notificaciones de otro colegio", async () => {
    prismaMock.notificacion.updateMany.mockResolvedValue({ count: 1 });

    await marcarTodasLeidas("usr_1", "col_1");

    expect(prismaMock.notificacion.updateMany).toHaveBeenCalledWith({
      where: { usuarioId: "usr_1", colegioId: "col_1", leidaEn: null },
      data: { leidaEn: expect.any(Date) },
    });
  });
});
