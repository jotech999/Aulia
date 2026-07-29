import { describe, it, expect, vi, beforeEach } from "vitest";

const { sesion, prismaMock, txMock } = vi.hoisted(() => {
  const txMock = { anotacion: { create: vi.fn().mockResolvedValue({ id: "an_new" }) } };
  return {
    txMock,
    sesion: { user: { id: "prof1", rol: "PROFESOR", colegioId: "col1" } },
    prismaMock: {
      curso: { findFirst: vi.fn() },
      $transaction: vi.fn(async (cb: (tx: typeof txMock) => Promise<void>) => cb(txMock)),
    },
  };
});

vi.mock("@/lib/sesion", () => ({ requerirSesion: vi.fn(async () => sesion) }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auditoria", () => ({ registrarAuditoria: vi.fn() }));
vi.mock("@/lib/notificaciones", () => ({ notificarApoderadosDeEstudiante: vi.fn(async () => ({})) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { crearAnotacionesLote } from "./actions";

beforeEach(() => {
  vi.clearAllMocks();
  sesion.user.rol = "PROFESOR";
  prismaMock.curso.findFirst.mockResolvedValue({
    matriculas: [
      { estudiante: { id: "est1", nombres: "Ana" } },
      { estudiante: { id: "est2", nombres: "Beto" } },
    ],
  });
});

describe("crearAnotacionesLote", () => {
  it("caso feliz: crea una anotación por estudiante válido", async () => {
    const res = await crearAnotacionesLote({
      cursoId: "curso1",
      estudianteIds: ["est1", "est2"],
      tipo: "POSITIVA",
      texto: "Excelente participación en la actividad grupal.",
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.creadas).toBe(2);
    expect(txMock.anotacion.create).toHaveBeenCalledTimes(2);
  });

  it("multi-tenant: rechaza todo el lote si un estudiante queda fuera del curso autorizado", async () => {
    prismaMock.curso.findFirst.mockResolvedValue({
      matriculas: [{ estudiante: { id: "est1", nombres: "Ana" } }],
    });
    const res = await crearAnotacionesLote({
      cursoId: "curso1",
      estudianteIds: ["est1", "estAjeno"],
      tipo: "NEUTRA",
      texto: "Registro del hecho observado en clase.",
    });
    expect(res.ok).toBe(false);
    expect(txMock.anotacion.create).not.toHaveBeenCalled();
  });

  it("advierte si el texto parece dato de salud y no guarda hasta confirmar", async () => {
    const res = await crearAnotacionesLote({
      cursoId: "curso1",
      estudianteIds: ["est1"],
      tipo: "NEUTRA",
      texto: "El estudiante tiene diagnóstico de asma y toma medicamentos.",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.advertencia).toBe(true);
    expect(txMock.anotacion.create).not.toHaveBeenCalled();
  });

  it("permiso denegado: un apoderado no puede crear anotaciones", async () => {
    sesion.user.rol = "APODERADO";
    const res = await crearAnotacionesLote({
      cursoId: "curso1",
      estudianteIds: ["est1"],
      tipo: "POSITIVA",
      texto: "Texto cualquiera de prueba.",
    });
    expect(res.ok).toBe(false);
    expect(prismaMock.curso.findFirst).not.toHaveBeenCalled();
    expect(txMock.anotacion.create).not.toHaveBeenCalled();
  });
});
