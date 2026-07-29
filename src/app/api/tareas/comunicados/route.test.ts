import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    trabajoOutbox: { updateMany: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auditoria", () => ({ registrarAuditoria: vi.fn() }));
vi.mock("@/lib/notificaciones", () => ({ crearNotificaciones: vi.fn() }));

import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "secreto-prueba";
  prismaMock.trabajoOutbox.updateMany.mockResolvedValue({ count: 0 });
  prismaMock.trabajoOutbox.findMany.mockResolvedValue([]);
});

describe("tarea de comunicados", () => {
  it("rechaza invocaciones sin el secreto", async () => {
    const respuesta = await GET(new NextRequest("http://localhost/api/tareas/comunicados"));
    expect(respuesta.status).toBe(401);
    expect(prismaMock.trabajoOutbox.findMany).not.toHaveBeenCalled();
  });

  it("recupera leases vencidos antes de tomar nuevos trabajos", async () => {
    const respuesta = await GET(new NextRequest("http://localhost/api/tareas/comunicados", { headers: { authorization: "Bearer secreto-prueba" } }));
    expect(respuesta.status).toBe(200);
    expect(prismaMock.trabajoOutbox.updateMany).toHaveBeenCalledTimes(2);
    expect(prismaMock.trabajoOutbox.updateMany).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: expect.objectContaining({ tipo: "PUBLICAR_COMUNICADO", estado: "PROCESANDO", intentos: { lt: 5 } }),
      data: expect.objectContaining({ estado: "PENDIENTE", errorCodigo: "LEASE_VENCIDO" }),
    }));
    expect(prismaMock.trabajoOutbox.findMany).toHaveBeenCalled();
  });
});
