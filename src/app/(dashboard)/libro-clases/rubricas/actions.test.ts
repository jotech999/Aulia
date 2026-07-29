import { beforeEach, describe, expect, it, vi } from "vitest";

const { sesion, prismaMock, txMock, auditoriaMock } = vi.hoisted(() => {
  const txMock = {
    rubrica: { create: vi.fn().mockResolvedValue({ id: "rubrica-1" }) },
    aplicacionRubrica: {
      create: vi.fn().mockResolvedValue({ id: "aplicacion-1" }),
      update: vi.fn(),
    },
    puntajeCriterioRubrica: {
      deleteMany: vi.fn(),
      upsert: vi.fn(),
    },
  };
  return {
    sesion: {
      user: { id: "prof-1", rol: "PROFESOR", colegioId: "colegio-1" },
    },
    txMock,
    auditoriaMock: vi.fn(),
    prismaMock: {
      asignatura: { findFirst: vi.fn() },
      oa: { findMany: vi.fn() },
      evaluacion: { findFirst: vi.fn() },
      matricula: { findFirst: vi.fn() },
      aplicacionRubrica: { findUnique: vi.fn() },
      $transaction: vi.fn(async (callback: (tx: typeof txMock) => Promise<unknown>) =>
        callback(txMock)
      ),
    },
  };
});

vi.mock("@/lib/sesion", () => ({ requerirSesion: vi.fn(async () => sesion) }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auditoria", () => ({ registrarAuditoria: auditoriaMock }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { crearRubrica, guardarAplicacionRubrica } from "./actions";

const entrada = {
  asignaturaId: "asignatura-1",
  nombre: "Producción de un texto argumentativo",
  descripcion: "Rúbrica formativa para retroalimentar el proceso.",
  tipo: "RUBRICA" as const,
  oaCodigos: ["LE06 OA 18"],
  criterios: [
    {
      descripcion: "Formula una tesis clara",
      peso: 1,
      niveles: [
        { etiqueta: "Logrado", descriptor: "La tesis es clara y defendible.", puntaje: 2 },
        { etiqueta: "En proceso", descriptor: "La tesis requiere precisión.", puntaje: 1 },
      ],
    },
  ],
};

const asignaturaPropia = {
  id: "asignatura-1",
  nombre: "Lenguaje y Comunicación",
  docenteId: "prof-1",
  curso: { id: "curso-1", nivel: "6B", profesorJefeId: null },
};

beforeEach(() => {
  vi.clearAllMocks();
  sesion.user.id = "prof-1";
  sesion.user.rol = "PROFESOR";
  sesion.user.colegioId = "colegio-1";
  prismaMock.asignatura.findFirst.mockResolvedValue(asignaturaPropia);
  prismaMock.oa.findMany.mockResolvedValue([{ codigo: "LE06 OA 18" }]);
  txMock.rubrica.create.mockResolvedValue({ id: "rubrica-1" });
  prismaMock.evaluacion.findFirst.mockResolvedValue({
    id: "evaluacion-1",
    rubricaId: "rubrica-1",
    asignaturaId: "asignatura-1",
    asignatura: asignaturaPropia,
    rubrica: {
      id: "rubrica-1",
      estado: "PUBLICADA",
      eliminadaEn: null,
      criterios: [
        {
          id: "criterio-1",
          peso: 1,
          puntajeMax: 4,
          niveles: [{ id: "nivel-1", puntaje: 4 }],
        },
      ],
    },
  });
  prismaMock.matricula.findFirst.mockResolvedValue({ id: "matricula-1" });
  prismaMock.aplicacionRubrica.findUnique.mockResolvedValue(null);
  txMock.aplicacionRubrica.create.mockResolvedValue({ id: "aplicacion-1" });
});

describe("guardarAplicacionRubrica", () => {
  const aplicacion = {
    rubricaId: "rubrica-1",
    evaluacionId: "evaluacion-1",
    estudianteId: "estudiante-1",
    retroalimentacion: "Argumenta con claridad; el próximo paso es citar la evidencia.",
    finalizar: true,
    selecciones: [
      { criterioId: "criterio-1", nivelId: "nivel-1", comentario: "Logro consistente." },
    ],
  };

  it("caso feliz: finaliza puntaje y feedback en una transacción, sin crear nota", async () => {
    const resultado = await guardarAplicacionRubrica(aplicacion);

    expect(resultado).toEqual({
      ok: true,
      aplicacionId: "aplicacion-1",
      puntajeTotal: 4,
      finalizada: true,
    });
    expect(txMock.aplicacionRubrica.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          colegioId: "colegio-1",
          estado: "FINALIZADA",
          puntajeTotal: 4,
        }),
      })
    );
    expect(txMock.puntajeCriterioRubrica.upsert).toHaveBeenCalledTimes(1);
    expect(auditoriaMock).toHaveBeenCalledWith(
      expect.objectContaining({ entidad: "AplicacionRubrica", colegioId: "colegio-1" }),
      txMock
    );
  });

  it("permiso denegado: no aplica si el docente no dicta la asignatura ni es jefe", async () => {
    prismaMock.evaluacion.findFirst.mockResolvedValue({
      ...(await prismaMock.evaluacion.findFirst()),
      asignatura: {
        ...asignaturaPropia,
        docenteId: "otro-profesor",
        curso: { ...asignaturaPropia.curso, profesorJefeId: "otro-jefe" },
      },
    });

    const resultado = await guardarAplicacionRubrica(aplicacion);

    expect(resultado.ok).toBe(false);
    expect(prismaMock.matricula.findFirst).not.toHaveBeenCalled();
    expect(txMock.aplicacionRubrica.create).not.toHaveBeenCalled();
  });

  it("multi-tenant: la evaluación se consulta dentro del colegio de sesión", async () => {
    sesion.user.colegioId = "colegio-2";
    prismaMock.evaluacion.findFirst.mockResolvedValue(null);

    const resultado = await guardarAplicacionRubrica(aplicacion);

    expect(resultado.ok).toBe(false);
    expect(prismaMock.evaluacion.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ colegioId: "colegio-2", rubricaId: "rubrica-1" }),
      })
    );
    expect(txMock.aplicacionRubrica.create).not.toHaveBeenCalled();
  });
});

describe("crearRubrica", () => {
  it("caso feliz: crea borrador completo y audita en la misma transacción", async () => {
    const resultado = await crearRubrica(entrada);

    expect(resultado).toEqual({ ok: true, id: "rubrica-1" });
    expect(txMock.rubrica.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          colegioId: "colegio-1",
          asignaturaId: "asignatura-1",
          estado: "BORRADOR",
          criterios: expect.any(Object),
        }),
      })
    );
    expect(auditoriaMock).toHaveBeenCalledWith(
      expect.objectContaining({ colegioId: "colegio-1", entidad: "Rubrica" }),
      txMock
    );
  });

  it("permiso denegado: un docente ajeno no puede crear en la asignatura", async () => {
    prismaMock.asignatura.findFirst.mockResolvedValue({
      ...asignaturaPropia,
      docenteId: "otro-profesor",
      curso: { ...asignaturaPropia.curso, profesorJefeId: "otro-jefe" },
    });

    const resultado = await crearRubrica(entrada);

    expect(resultado.ok).toBe(false);
    expect(prismaMock.oa.findMany).not.toHaveBeenCalled();
    expect(txMock.rubrica.create).not.toHaveBeenCalled();
  });

  it("multi-tenant: busca la asignatura en el colegio de sesión y rechaza un id ajeno", async () => {
    sesion.user.colegioId = "colegio-2";
    prismaMock.asignatura.findFirst.mockResolvedValue(null);

    const resultado = await crearRubrica(entrada);

    expect(resultado.ok).toBe(false);
    expect(prismaMock.asignatura.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "asignatura-1", colegioId: "colegio-2" },
      })
    );
    expect(txMock.rubrica.create).not.toHaveBeenCalled();
  });
});
