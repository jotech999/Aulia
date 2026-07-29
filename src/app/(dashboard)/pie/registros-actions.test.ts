import { beforeEach, describe, expect, it, vi } from "vitest";

const { sesion, prismaMock, txMock, auditoriaMock } = vi.hoisted(() => {
  const txMock = {
    fichaPie: {
      upsert: vi.fn().mockResolvedValue({ id: "ficha_1" }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
  return {
    sesion: { user: { id: "u_1", colegioId: "col_1", rol: "PIE" } },
    txMock,
    auditoriaMock: vi.fn(),
    prismaMock: {
      curso: { findFirst: vi.fn().mockResolvedValue({ id: "curso_1" }) },
      estudiante: { findFirst: vi.fn().mockResolvedValue({ id: "est_1" }) },
      fichaPie: {
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
      },
      $transaction: vi.fn(async (callback: (tx: typeof txMock) => Promise<unknown>) =>
        callback(txMock),
      ),
    },
  };
});

vi.mock("@/lib/sesion", () => ({ requerirSesion: vi.fn(async () => sesion) }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auditoria", () => ({ registrarAuditoria: auditoriaMock }));
vi.mock("@/lib/cifrado", () => ({
  cifradoDisponible: vi.fn(() => true),
  cifrar: vi.fn(() => "payload-cifrado"),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { guardarRegistroPie, listarRegistrosPie } from "./registros-actions";

beforeEach(() => {
  vi.clearAllMocks();
  sesion.user.rol = "PIE";
  prismaMock.curso.findFirst.mockResolvedValue({ id: "curso_1" });
  prismaMock.estudiante.findFirst.mockResolvedValue({ id: "est_1" });
  prismaMock.fichaPie.findFirst.mockResolvedValue(null);
  prismaMock.fichaPie.findMany.mockResolvedValue([]);
  txMock.fichaPie.upsert.mockResolvedValue({ id: "ficha_1" });
});

describe("listarRegistrosPie", () => {
  it("niega el listado a roles ajenos a PIE", async () => {
    sesion.user.rol = "PROFESOR";

    const resultado = await listarRegistrosPie({});

    expect(resultado.ok).toBe(false);
    expect(prismaMock.fichaPie.findMany).not.toHaveBeenCalled();
  });

  it("filtra por colegio y nunca selecciona el diagnóstico", async () => {
    const resultado = await listarRegistrosPie({});

    expect(resultado.ok).toBe(true);
    const consulta = prismaMock.fichaPie.findMany.mock.calls[0][0];
    expect(consulta.where).toMatchObject({ colegioId: "col_1", eliminadaEn: null });
    expect(consulta.select).not.toHaveProperty("diagnosticoCifrado");
    expect(consulta.select).not.toHaveProperty("apoyos");
  });
});

describe("guardarRegistroPie", () => {
  it("cifra el diagnóstico y audita solo metadatos", async () => {
    const resultado = await guardarRegistroPie({
      estudianteId: "est_1",
      diagnostico: "diagnóstico clínico reservado",
      apoyos: "adecuación de acceso",
      profesionalACargo: "Equipo PIE",
    });

    expect(resultado).toEqual({ ok: true, id: "ficha_1" });
    expect(txMock.fichaPie.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          colegioId: "col_1",
          diagnosticoCifrado: "payload-cifrado",
          creadaPorId: "u_1",
        }),
      }),
    );
    const auditoria = auditoriaMock.mock.calls[0][0];
    expect(JSON.stringify(auditoria)).not.toContain("diagnóstico clínico reservado");
    expect(auditoria).toMatchObject({ colegioId: "col_1", entidad: "FichaPie" });
  });
});
