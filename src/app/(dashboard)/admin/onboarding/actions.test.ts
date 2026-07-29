import { beforeEach, describe, expect, it, vi } from "vitest";

const { sesion, prismaMock, txMock } = vi.hoisted(() => {
  const tx = {
    onboardingColegio: { upsert: vi.fn() },
    auditLog: { create: vi.fn() },
  };
  return {
    sesion: { user: { id: "admin_1", rol: "ADMIN", colegioId: "col_1" } },
    txMock: tx,
    prismaMock: {
      onboardingColegio: { findUnique: vi.fn() },
      $transaction: vi.fn(async (cb: (cliente: typeof tx) => Promise<unknown>) => cb(tx)),
    },
  };
});

vi.mock("@/lib/sesion", () => ({ requerirSesion: vi.fn(async () => sesion) }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { guardarAvanceOnboarding } from "./actions";

beforeEach(() => {
  vi.clearAllMocks();
  sesion.user.id = "admin_1";
  sesion.user.rol = "ADMIN";
  sesion.user.colegioId = "col_1";
  prismaMock.onboardingColegio.findUnique.mockResolvedValue(null);
  txMock.onboardingColegio.upsert.mockResolvedValue({ id: "onb_1", estado: "EN_PROGRESO", pasoActual: "CURSOS" });
  txMock.auditLog.create.mockResolvedValue({ id: 1n });
});

describe("guardarAvanceOnboarding", () => {
  it("guarda el avance del colegio y registra auditoría", async () => {
    const resultado = await guardarAvanceOnboarding("CURSOS");

    expect(resultado).toEqual({ ok: true, estado: "EN_PROGRESO" });
    expect(txMock.onboardingColegio.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { colegioId: "col_1" },
      create: expect.objectContaining({ colegioId: "col_1", pasoActual: "CURSOS", iniciadoPorId: "admin_1" }),
    }));
    expect(txMock.auditLog.create).toHaveBeenCalledOnce();
  });

  it("rechaza a un rol sin facultades administrativas", async () => {
    sesion.user.rol = "PROFESOR";

    const resultado = await guardarAvanceOnboarding("CURSOS");

    expect(resultado.ok).toBe(false);
    expect(prismaMock.onboardingColegio.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});
