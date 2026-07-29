import { beforeEach, describe, expect, it, vi } from "vitest";

const { sesion, prismaMock, txMock, auditoriaMock, cifrarMock } = vi.hoisted(() => {
  const txMock = {
    bloqueHorario: { findFirst: vi.fn() },
    eventoEscolar: { findFirst: vi.fn() },
    planificacion: { findFirst: vi.fn() },
    claseRegistrada: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  };
  return {
    txMock,
    auditoriaMock: vi.fn(),
    cifrarMock: vi.fn((texto: string) => `cifrado:${texto}`),
    sesion: {
      user: { id: "doc_1", rol: "PROFESOR", colegioId: "col_1" },
    },
    prismaMock: {
      asignatura: { findFirst: vi.fn() },
      $transaction: vi.fn(
        async (
          cb: (tx: typeof txMock) => Promise<unknown>,
          _opciones?: unknown
        ) => cb(txMock)
      ),
    },
  };
});

vi.mock("@/lib/sesion", () => ({ requerirSesion: vi.fn(async () => sesion) }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auditoria", () => ({ registrarAuditoria: auditoriaMock }));
vi.mock("@/lib/cifrado-justificacion", () => ({
  cifrarDetalleJustificacion: cifrarMock,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { firmarClase, guardarClase, rectificarClase } from "./actions";

const entrada = {
  asignaturaId: "asig_1",
  bloqueHorarioId: "bloque_1",
  fecha: "2026-07-21",
  contenido: "Fracciones equivalentes",
  oaIds: ["MA05-OA-07"],
};

beforeEach(() => {
  vi.clearAllMocks();
  sesion.user.rol = "PROFESOR";
  prismaMock.asignatura.findFirst.mockResolvedValue({
    id: "asig_1",
    docenteId: "doc_1",
    curso: {
      id: "curso_1",
      profesorJefeId: null,
      anioEscolar: { anio: 2026 },
    },
  });
  txMock.bloqueHorario.findFirst.mockResolvedValue({ id: "bloque_1" });
  txMock.eventoEscolar.findFirst.mockResolvedValue(null);
  txMock.planificacion.findFirst.mockResolvedValue(null);
  txMock.claseRegistrada.findFirst.mockResolvedValue(null);
  txMock.claseRegistrada.create.mockResolvedValue({ id: "clase_1" });
  txMock.claseRegistrada.updateMany.mockResolvedValue({ count: 1 });
});

const claseFirmable = {
  id: "clase_1",
  fecha: new Date("2026-07-21T00:00:00.000Z"),
  contenido: "Fracciones equivalentes",
  oaIds: ["MA05-OA-07"],
  firmadaEn: null,
  firmadaPorId: null,
  bloqueHorarioId: "bloque_1",
  planificacionOrigenId: "plan_1",
  planificacionOrigenVersion: 3,
  planificacionSnapshotHash: "a".repeat(64),
  actualizadaEn: new Date("2026-07-21T12:00:00.000Z"),
  bloqueHorario: {
    colegioId: "col_1",
    eliminadaEn: null,
    dia: 2,
    horarioVersion: {
      estado: "PUBLICADO",
      vigenteDesde: new Date("2026-03-01T00:00:00.000Z"),
      vigenteHasta: null,
    },
  },
};

describe("firmarClase — explícita, vigente e inmutable", () => {
  it("firma de forma atómica sin modificar la procedencia", async () => {
    txMock.claseRegistrada.findFirst.mockResolvedValue(claseFirmable);

    const resultado = await firmarClase("asig_1", "clase_1");

    expect(resultado).toEqual({ ok: true });
    expect(txMock.claseRegistrada.updateMany).toHaveBeenCalledWith({
      where: {
        id: "clase_1",
        colegioId: "col_1",
        firmadaEn: null,
        eliminadaEn: null,
      },
      data: {
        firmadaPorId: "doc_1",
        firmadaEn: expect.any(Date),
      },
    });
    expect(auditoriaMock).toHaveBeenCalledWith(
      expect.objectContaining({
        accion: "FIRMAR",
        despues: expect.objectContaining({
          planificacionOrigenId: "plan_1",
          planificacionOrigenVersion: 3,
          snapshotCifrado: `cifrado:${JSON.stringify({
            contenido: claseFirmable.contenido,
            oaIds: claseFirmable.oaIds,
          })}`,
        }),
      }),
      txMock
    );
  });

  it("rechaza firmar en feriado aunque exista un bloque semanal", async () => {
    txMock.claseRegistrada.findFirst.mockResolvedValue({
      ...claseFirmable,
      fecha: new Date("2026-07-16T00:00:00.000Z"),
    });

    const resultado = await firmarClase("asig_1", "clase_1");

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error).toMatch(/feriado/i);
    expect(txMock.claseRegistrada.updateMany).not.toHaveBeenCalled();
  });

  it("detecta una firma concurrente y no duplica la auditoría", async () => {
    txMock.claseRegistrada.findFirst.mockResolvedValue(claseFirmable);
    txMock.claseRegistrada.updateMany.mockResolvedValue({ count: 0 });

    const resultado = await firmarClase("asig_1", "clase_1");

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error).toMatch(/otra persona/i);
    expect(auditoriaMock).not.toHaveBeenCalled();
  });
});

describe("rectificarClase — historial append-only recuperable", () => {
  const entradaRectificacion = {
    ...entrada,
    claseId: "clase_1",
    contenido: "Fracciones equivalentes y comparación",
    motivo: "Se precisó el contenido efectivamente tratado.",
  };

  it("conserva antes, después y motivo recuperables pero cifrados", async () => {
    txMock.claseRegistrada.findFirst.mockResolvedValue({
      ...claseFirmable,
      firmadaEn: new Date("2026-07-21T13:00:00.000Z"),
      firmadaPorId: "doc_1",
    });

    const resultado = await rectificarClase(entradaRectificacion);

    expect(resultado).toEqual({ ok: true });
    expect(txMock.claseRegistrada.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          contenido: entradaRectificacion.contenido,
          oaIds: entradaRectificacion.oaIds,
        },
      })
    );
    expect(auditoriaMock).toHaveBeenCalledWith(
      expect.objectContaining({
        accion: "MODIFICAR",
        antes: expect.objectContaining({
          oaIds: claseFirmable.oaIds,
          snapshotCifrado: `cifrado:${JSON.stringify({
            contenido: claseFirmable.contenido,
            oaIds: claseFirmable.oaIds,
          })}`,
        }),
        despues: expect.objectContaining({
          snapshotCifrado: `cifrado:${JSON.stringify({
            contenido: entradaRectificacion.contenido,
            oaIds: entradaRectificacion.oaIds,
          })}`,
          motivoCifrado: `cifrado:${entradaRectificacion.motivo}`,
          rectificacion: true,
        }),
      }),
      txMock
    );
  });

  it("no sobrescribe ni audita si la clase cambió concurrentemente", async () => {
    txMock.claseRegistrada.findFirst.mockResolvedValue({
      ...claseFirmable,
      firmadaEn: new Date("2026-07-21T13:00:00.000Z"),
      firmadaPorId: "doc_1",
    });
    txMock.claseRegistrada.updateMany.mockResolvedValue({ count: 0 });

    const resultado = await rectificarClase(entradaRectificacion);

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error).toMatch(/cambió/i);
    expect(auditoriaMock).not.toHaveBeenCalled();
  });
});

describe("guardarClase — bloque horario activo", () => {
  it("rechaza registrar una clase futura en horario de Santiago", async () => {
    const resultado = await guardarClase({ ...entrada, fecha: "2099-01-01" });

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error).toMatch(/futura/i);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("rechaza registrar una clase en un feriado legal", async () => {
    const resultado = await guardarClase({ ...entrada, fecha: "2026-07-16" });

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error).toMatch(/feriado/i);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("valida el bloque y crea la clase en la misma transacción serializable", async () => {
    const resultado = await guardarClase(entrada);

    expect(resultado).toEqual({ ok: true, id: "clase_1" });
    expect(prismaMock.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      { isolationLevel: "Serializable" }
    );
    expect(txMock.bloqueHorario.findFirst).toHaveBeenCalledWith({
      where: {
        id: "bloque_1",
        colegioId: "col_1",
        asignaturaId: "asig_1",
        eliminadaEn: null,
        dia: 2,
        horarioVersion: {
          estado: "PUBLICADO",
          vigenteDesde: { lte: new Date("2026-07-21T00:00:00.000Z") },
          OR: [
            { vigenteHasta: null },
            { vigenteHasta: { gte: new Date("2026-07-21T00:00:00.000Z") } },
          ],
        },
      },
      select: { id: true },
    });
    expect(txMock.claseRegistrada.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ bloqueHorarioId: "bloque_1" }),
      })
    );
    expect(auditoriaMock).toHaveBeenCalledWith(
      expect.objectContaining({
        accion: "CREAR",
        entidad: "ClaseRegistrada",
        entidadId: "clase_1",
      }),
      txMock
    );
  });

  it("rechaza un bloque retirado sin crear una clase", async () => {
    txMock.bloqueHorario.findFirst.mockResolvedValue(null);
    const resultado = await guardarClase(entrada);

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error).toMatch(/jornada lectiva activa/i);
    expect(txMock.claseRegistrada.create).not.toHaveBeenCalled();
    expect(auditoriaMock).not.toHaveBeenCalled();
  });

  it("deniega al profesor que no dicta la asignatura", async () => {
    prismaMock.asignatura.findFirst.mockResolvedValue({
      id: "asig_1",
      docenteId: "doc_2",
      curso: { profesorJefeId: null },
    });
    const resultado = await guardarClase(entrada);

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error).toMatch(/permiso/i);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("guarda la procedencia tenant-scoped de la planificación copiada", async () => {
    txMock.planificacion.findFirst.mockResolvedValue({
      id: "plan_1",
      version: 3,
      titulo: "Clase 4: fracciones",
      descripcion: "Fracciones equivalentes",
      fechaInicio: new Date("2026-07-21T00:00:00.000Z"),
      fechaFin: new Date("2026-07-21T00:00:00.000Z"),
      padreId: "unidad_1",
      oas: [{ oaCodigo: "MA05-OA-07" }],
    });

    const resultado = await guardarClase({
      ...entrada,
      planificacionOrigenId: "plan_1",
    });

    expect(resultado).toEqual({ ok: true, id: "clase_1" });
    expect(txMock.planificacion.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "plan_1",
          colegioId: "col_1",
          asignaturaId: "asig_1",
          tipo: "CLASE",
          esPlantilla: false,
        }),
      })
    );
    expect(txMock.claseRegistrada.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          planificacionOrigenId: "plan_1",
          planificacionOrigenVersion: 3,
          planificacionSnapshotHash: expect.stringMatching(/^[a-f0-9]{64}$/),
          planificacionCopiadaPorId: "doc_1",
          planificacionCopiadaEn: expect.any(Date),
        }),
      })
    );
  });

  it("rechaza una planificación ausente o de otro colegio", async () => {
    txMock.planificacion.findFirst.mockResolvedValue(null);

    const resultado = await guardarClase({
      ...entrada,
      planificacionOrigenId: "plan_ajena",
    });

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error).toMatch(/no pertenece/i);
    expect(txMock.claseRegistrada.create).not.toHaveBeenCalled();
    expect(auditoriaMock).not.toHaveBeenCalled();
  });
});
