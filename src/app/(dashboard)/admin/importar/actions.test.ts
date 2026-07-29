import { describe, it, expect, vi, beforeEach } from "vitest";

const { sesion, prismaMock, txMock } = vi.hoisted(() => {
  const txMock = {
    estudiante: { create: vi.fn().mockResolvedValue({ id: "est_new" }) },
    matricula: { create: vi.fn().mockResolvedValue({}) },
    curso: { create: vi.fn().mockResolvedValue({}) },
  };
  return {
    txMock,
    sesion: { user: { id: "u1", rol: "PROFESOR", colegioId: "col_1" } },
    prismaMock: {
      estudiante: { findMany: vi.fn().mockResolvedValue([]) },
      curso: { findMany: vi.fn().mockResolvedValue([]) },
      anioEscolar: { findFirst: vi.fn().mockResolvedValue({ id: "a1" }) },
      $transaction: vi.fn(async (cb: (tx: typeof txMock) => Promise<void>) => cb(txMock)),
    },
  };
});

vi.mock("@/lib/sesion", () => ({ requerirSesion: vi.fn(async () => sesion) }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auditoria", () => ({ registrarAuditoria: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { previsualizar, confirmar } from "./actions";

const CSV = "rut;nombres;apellidos;fecha_nacimiento;nivel;letra\n11111111-1;Ana;Pérez;2015-03-21;;";

beforeEach(() => {
  sesion.user.rol = "PROFESOR";
});

describe("importar — autorización", () => {
  it("un rol sin permiso (PROFESOR) no puede previsualizar ni confirmar", async () => {
    const pv = await previsualizar({ tipo: "estudiantes", contenido: CSV });
    expect(pv.ok).toBe(false);
    if (!pv.ok) expect(pv.error).toMatch(/permiso/i);

    const cf = await confirmar({ tipo: "estudiantes", contenido: CSV });
    expect(cf.ok).toBe(false);
    // No debe consultar la BD para importar si no está autorizado.
    expect(prismaMock.estudiante.findMany).not.toHaveBeenCalled();
  });

  it("ADMIN sí obtiene previsualización con el conteo de válidas", async () => {
    sesion.user.rol = "ADMIN";
    const pv = await previsualizar({ tipo: "estudiantes", contenido: CSV });
    expect(pv.ok).toBe(true);
    if (pv.ok) expect(pv.resumen.validas).toBe(1);
  });
});

describe("importar — confirmación (caso feliz)", () => {
  it("ADMIN importa solo las filas válidas y omite las inválidas", async () => {
    sesion.user.rol = "ADMIN";
    // 2 filas: una válida (RUT ok) y una inválida (DV incorrecto) → crea 1, omite 1.
    const csv =
      "rut;nombres;apellidos;fecha_nacimiento;nivel;letra\n" +
      "11111111-1;Ana;Pérez;2015-03-21;;\n" +
      "12345678-9;Mal;Rut;;;";
    const res = await confirmar({ tipo: "estudiantes", contenido: csv });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.creadas).toBe(1);
      expect(res.omitidas).toBe(1);
    }
    expect(txMock.estudiante.create).toHaveBeenCalledTimes(1);
  });
});
