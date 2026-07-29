import { describe, it, expect, vi, beforeEach } from "vitest";

// Mocks de efectos (BD, sesión, auditoría, notificaciones). La lógica pura de
// `@/lib/calificaciones` (esNotaValida, autorizarRegistroNotas…) se usa REAL.
const { sesion, prismaMock, txMock } = vi.hoisted(() => {
  const txMock = {
    calificacion: {
      create: vi.fn().mockResolvedValue({ id: "cal_new" }),
      update: vi.fn().mockResolvedValue({}),
    },
  };
  return {
    txMock,
    sesion: { user: { id: "doc1", rol: "PROFESOR", colegioId: "col1", colegioNombre: "Demo" } },
    prismaMock: {
      asignatura: {
        findFirst: vi.fn().mockResolvedValue({
          docenteId: "doc1",
          nombre: "Lenguaje",
          cursoId: "curso1",
          curso: { nivel: "1B", anioEscolar: { regimen: "SEMESTRAL" } },
        }),
      },
      evaluacion: { findMany: vi.fn().mockResolvedValue([{ id: "ev1", nombre: "Prueba" }]) },
      matricula: { findMany: vi.fn().mockResolvedValue([{ estudianteId: "est1", estudiante: { nombres: "Ana María" } }]) },
      calificacion: { findMany: vi.fn().mockResolvedValue([]) },
      $transaction: vi.fn(async (cb: (tx: typeof txMock) => Promise<void>) => cb(txMock)),
    },
  };
});

vi.mock("@/lib/sesion", () => ({ requerirSesion: vi.fn(async () => sesion) }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auditoria", () => ({ registrarAuditoria: vi.fn() }));
vi.mock("@/lib/notificaciones", () => ({
  notificarCalificacionApoderados: vi.fn(async () => ({ inApp: 0, emails: 0, push: 0 })),
  notificarApoderadosDeCurso: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("./consultas", () => ({ periodosDeRegimen: () => [1, 2] }));

import { guardarCalificacionesLote } from "./actions";

beforeEach(() => {
  vi.clearAllMocks();
  sesion.user.id = "doc1";
  sesion.user.rol = "PROFESOR";
  txMock.calificacion.create.mockResolvedValue({ id: "cal_new" });
});

describe("guardarCalificacionesLote — pegado por lote", () => {
  it("caso feliz: guarda las celdas válidas de la asignatura", async () => {
    const res = await guardarCalificacionesLote({
      asignaturaId: "asig1",
      celdas: [{ evaluacionId: "ev1", estudianteId: "est1", nota: 5, eximida: false }],
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.guardados).toBe(1);
      expect(res.invalidos).toBe(0);
    }
    expect(txMock.calificacion.create).toHaveBeenCalledTimes(1);
  });

  it("multi-tenant: descarta evaluación o estudiante ajenos y no los escribe", async () => {
    const res = await guardarCalificacionesLote({
      asignaturaId: "asig1",
      celdas: [
        { evaluacionId: "ev1", estudianteId: "est1", nota: 5, eximida: false }, // válida
        { evaluacionId: "ev1", estudianteId: "estAjeno", nota: 6, eximida: false }, // estudiante ajeno
        { evaluacionId: "evAjeno", estudianteId: "est1", nota: 4, eximida: false }, // evaluación ajena
      ],
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.guardados).toBe(1);
      expect(res.invalidos).toBe(2);
    }
    // Solo se escribe la celda válida; jamás los ids ajenos.
    expect(txMock.calificacion.create).toHaveBeenCalledTimes(1);
    const arg = txMock.calificacion.create.mock.calls[0][0];
    expect(arg.data.estudianteId).toBe("est1");
    expect(arg.data.evaluacionId).toBe("ev1");
  });

  it("descarta notas fuera de escala sin abortar el resto del lote", async () => {
    const res = await guardarCalificacionesLote({
      asignaturaId: "asig1",
      celdas: [
        { evaluacionId: "ev1", estudianteId: "est1", nota: 9.9, eximida: false }, // fuera de escala
      ],
    });
    // Ninguna válida → error explícito, sin escribir.
    expect(res.ok).toBe(false);
    expect(txMock.calificacion.create).not.toHaveBeenCalled();
  });

  it("permiso denegado: un docente que no dicta la asignatura no puede guardar", async () => {
    sesion.user.id = "otroDocente"; // asignatura.docenteId = "doc1"
    const res = await guardarCalificacionesLote({
      asignaturaId: "asig1",
      celdas: [{ evaluacionId: "ev1", estudianteId: "est1", nota: 5, eximida: false }],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/permiso/i);
    expect(txMock.calificacion.create).not.toHaveBeenCalled();
  });
});
