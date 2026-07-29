import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, txMock } = vi.hoisted(() => {
  const txMock = {
    limiteAutenticacion: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
    },
  };
  return {
    txMock,
    prismaMock: {
      limiteAutenticacion: {
        findUnique: vi.fn(),
        deleteMany: vi.fn(),
      },
      $transaction: vi.fn(async (cb: (tx: typeof txMock) => unknown) => cb(txMock)),
    },
  };
});

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { estaBloqueado, limpiarIntentos, minutosBloqueo, registrarFallo } from "./rate-limit";

beforeEach(() => vi.clearAllMocks());

describe("rate-limit distribuido", () => {
  it("no guarda el correo en claro y crea la primera ventana", async () => {
    txMock.limiteAutenticacion.findUnique.mockResolvedValue(null);
    await registrarFallo("Persona@Ejemplo.cl");
    const args = txMock.limiteAutenticacion.upsert.mock.calls[0][0];
    expect(args.where.claveHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(args)).not.toContain("Persona@Ejemplo.cl");
  });

  it("activa el bloqueo al quinto fallo", async () => {
    txMock.limiteAutenticacion.findUnique.mockResolvedValue({
      intentos: 4,
      ventanaIniciaEn: new Date(),
    });
    await registrarFallo("u@test.cl");
    expect(txMock.limiteAutenticacion.update.mock.calls[0][0].data.bloqueadoHasta).toBeInstanceOf(Date);
  });

  it("consulta y limpia el contador compartido", async () => {
    prismaMock.limiteAutenticacion.findUnique.mockResolvedValue({
      bloqueadoHasta: new Date(Date.now() + 120_000),
    });
    expect(await estaBloqueado("u@test.cl")).toBe(true);
    expect(await minutosBloqueo("u@test.cl")).toBeGreaterThan(0);
    await limpiarIntentos("u@test.cl");
    expect(prismaMock.limiteAutenticacion.deleteMany).toHaveBeenCalledOnce();
  });
});
