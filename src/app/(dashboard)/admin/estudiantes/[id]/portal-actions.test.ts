import { beforeEach, describe, expect, it, vi } from "vitest";

const { sesion, prismaMock, txMock, emailMock } = vi.hoisted(() => {
  const tx = {
    membresia: { upsert: vi.fn(), updateMany: vi.fn() },
    accesoEstudiante: { upsert: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn() },
    trabajoOutbox: { updateMany: vi.fn(), create: vi.fn() },
    auditLog: { create: vi.fn() },
  };
  return {
    sesion: { user: { id: "dir_1", rol: "DIRECTOR", colegioId: "col_1", colegioNombre: "Colegio Uno" } },
    txMock: tx,
    emailMock: vi.fn(),
    prismaMock: {
      estudiante: { findFirst: vi.fn() },
      usuario: { findUnique: vi.fn() },
      accesoEstudiante: { findUnique: vi.fn() },
      trabajoOutbox: { updateMany: vi.fn() },
      $transaction: vi.fn(async (cb: (cliente: typeof tx) => Promise<unknown>) => cb(tx)),
    },
  };
});

vi.mock("@/lib/sesion", () => ({ requerirSesion: vi.fn(async () => sesion) }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/email", () => ({ enviarEmail: emailMock }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/notificaciones", () => ({ notificarApoderadosDeEstudiante: vi.fn() }));

import { revocarPortalEstudiante, vincularPortalEstudiante } from "./actions";

beforeEach(() => {
  vi.clearAllMocks();
  sesion.user.rol = "DIRECTOR";
  sesion.user.colegioId = "col_1";
  prismaMock.estudiante.findFirst.mockResolvedValue({ id: "est_1" });
  prismaMock.usuario.findUnique.mockResolvedValue({ id: "usr_est", email: "estudiante@correo.cl", nombre: "Estudiante" });
  prismaMock.accesoEstudiante.findUnique.mockResolvedValue(null);
  txMock.membresia.upsert.mockResolvedValue({ id: "mem_est" });
  txMock.accesoEstudiante.upsert.mockResolvedValue({ id: "acc_1" });
  txMock.trabajoOutbox.updateMany.mockResolvedValue({ count: 0 });
  txMock.trabajoOutbox.create.mockResolvedValue({ id: "inv_1" });
  txMock.auditLog.create.mockResolvedValue({ id: 1n });
  emailMock.mockResolvedValue(true);
});

describe("invitación al portal estudiante", () => {
  it("mantiene acceso y membresía inactivos hasta confirmar el email", async () => {
    const resultado = await vincularPortalEstudiante({ estudianteId: "est_1", email: "estudiante@correo.cl" });

    expect(resultado.ok).toBe(true);
    expect(txMock.membresia.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ activa: false }), update: expect.objectContaining({ activa: false }) }));
    expect(txMock.accesoEstudiante.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ activo: false }), update: expect.objectContaining({ activo: false }) }));
    expect(txMock.trabajoOutbox.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ tipo: "INVITACION_PORTAL_ESTUDIANTE", payloadMinimo: expect.objectContaining({ tokenHash: expect.any(String), usuarioId: "usr_est" }) }) }));
    expect(emailMock).toHaveBeenCalledWith(expect.objectContaining({ to: "estudiante@correo.cl" }));
  });

  it("no invita a un estudiante de otro colegio", async () => {
    prismaMock.estudiante.findFirst.mockResolvedValue(null);
    const resultado = await vincularPortalEstudiante({ estudianteId: "est_otro", email: "estudiante@correo.cl" });
    expect(resultado.ok).toBe(false);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});

describe("revocación del portal estudiante", () => {
  it("revoca acceso y membresía en la misma transacción y audita", async () => {
    txMock.accesoEstudiante.findFirst.mockResolvedValue({ id: "acc_1", usuarioId: "usr_est" });
    txMock.accesoEstudiante.updateMany.mockResolvedValue({ count: 1 });
    txMock.membresia.updateMany.mockResolvedValue({ count: 1 });

    const resultado = await revocarPortalEstudiante("est_1");

    expect(resultado.ok).toBe(true);
    expect(txMock.accesoEstudiante.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ colegioId: "col_1", activo: true }), data: expect.objectContaining({ activo: false }) }));
    expect(txMock.membresia.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ colegioId: "col_1", rol: "ESTUDIANTE" }), data: expect.objectContaining({ activa: false }) }));
    expect(txMock.auditLog.create).toHaveBeenCalledOnce();
  });
});
