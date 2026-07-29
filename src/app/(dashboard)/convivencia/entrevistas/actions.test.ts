import { beforeEach, describe, expect, it, vi } from "vitest";

const { sesion, prismaMock, txMock, auditoriaMock, puedeVerMock } = vi.hoisted(() => {
  const txMock = {
    entrevista: { create: vi.fn().mockResolvedValue({ id: "entrevista_1" }) },
  };
  return {
    sesion: { user: { id: "u_1", colegioId: "col_1", rol: "PROFESOR_JEFE" } },
    auditoriaMock: vi.fn(),
    puedeVerMock: vi.fn().mockResolvedValue(true),
    txMock,
    prismaMock: {
      apoderado: {
        findFirst: vi.fn().mockResolvedValue({
          parentesco: "madre",
          calidad: "TITULAR",
          usuario: { nombre: "Persona apoderada" },
        }),
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
vi.mock("./consultas", () => ({ puedeVerEntrevistasDe: puedeVerMock }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { crearEntrevista } from "./actions";

const entrada = {
  estudianteId: "est_1",
  apoderadoId: "apo_1",
  apoderado: "Nombre enviado por cliente",
  calidadSnapshot: "Dato enviado por cliente",
  motivo: "Seguimiento académico",
  acuerdos: "Acuerdo reservado",
  compromisos: "Compromiso reservado",
  fecha: "2026-08-12",
  proximaCita: "",
};

beforeEach(() => {
  vi.clearAllMocks();
  sesion.user.rol = "PROFESOR_JEFE";
  puedeVerMock.mockResolvedValue(true);
  prismaMock.apoderado.findFirst.mockResolvedValue({
    parentesco: "madre",
    calidad: "TITULAR",
    usuario: { nombre: "Persona apoderada" },
  });
  txMock.entrevista.create.mockResolvedValue({ id: "entrevista_1" });
});

describe("crearEntrevista — vínculo institucional del apoderado", () => {
  it("verifica colegio+estudiante y guarda calidad autoritativa como snapshot", async () => {
    const resultado = await crearEntrevista(entrada);

    expect(resultado).toEqual({ ok: true, id: "entrevista_1" });
    expect(prismaMock.apoderado.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "apo_1",
          estudianteId: "est_1",
          estudiante: { colegioId: "col_1" },
        },
      }),
    );
    expect(txMock.entrevista.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          apoderado: "Persona apoderada",
          apoderadoId: "apo_1",
          calidadSnapshot: "Titular · madre",
        }),
      }),
    );
    expect(JSON.stringify(auditoriaMock.mock.calls[0][0])).not.toContain("Persona apoderada");
    expect(JSON.stringify(auditoriaMock.mock.calls[0][0])).not.toContain("Acuerdo reservado");
  });

  it("rechaza un vínculo inexistente o de otro colegio", async () => {
    prismaMock.apoderado.findFirst.mockResolvedValue(null);

    const resultado = await crearEntrevista(entrada);

    expect(resultado.ok).toBe(false);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("un apoderado no puede registrar entrevistas", async () => {
    sesion.user.rol = "APODERADO";

    const resultado = await crearEntrevista(entrada);

    expect(resultado.ok).toBe(false);
    expect(puedeVerMock).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});
