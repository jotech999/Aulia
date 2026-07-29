import { beforeEach, describe, expect, it, vi } from "vitest";

const { sesion, prismaMock, txMock, auditoriaMock } = vi.hoisted(() => {
  const txMock = {
    reunionApoderados: {
      create: vi.fn().mockResolvedValue({ id: "reunion_1" }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    asistenteReunionApoderados: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
  return {
    sesion: { user: { id: "u_1", colegioId: "col_1", rol: "PROFESOR_JEFE" } },
    auditoriaMock: vi.fn(),
    txMock,
    prismaMock: {
      curso: {
        findFirst: vi.fn().mockResolvedValue({ id: "curso_1", nivel: "5B", letra: "A" }),
      },
      estudiante: {
        findMany: vi.fn().mockResolvedValue([{ id: "est_1" }]),
      },
      apoderado: {
        findMany: vi.fn().mockResolvedValue([
          { id: "apo_1", estudianteId: "est_1", usuario: { nombre: "Persona apoderada" } },
        ]),
      },
      reunionApoderados: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn().mockResolvedValue({
          id: "reunion_1",
          cursoId: "curso_1",
          fecha: new Date("2026-08-10T00:00:00.000Z"),
          _count: { asistentes: 1 },
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
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  archivarReunionApoderados,
  crearReunionApoderados,
  listarReunionesApoderados,
} from "./actions";

const entradaValida = {
  cursoId: "curso_1",
  fecha: "2026-08-10",
  horaInicio: "18:00",
  horaFin: "19:15",
  tema: "Organización del segundo semestre",
  objetivo: "Alinear fechas y responsabilidades",
  asistentes: [{ apoderadoId: "apo_1", nombre: "Persona apoderada", estudianteId: "est_1" }],
  acuerdos: "Revisar el calendario semanalmente",
  observaciones: "Sin novedades",
};

beforeEach(() => {
  vi.clearAllMocks();
  sesion.user.rol = "PROFESOR_JEFE";
  prismaMock.curso.findFirst.mockResolvedValue({ id: "curso_1", nivel: "5B", letra: "A" });
  prismaMock.estudiante.findMany.mockResolvedValue([{ id: "est_1" }]);
  prismaMock.apoderado.findMany.mockResolvedValue([
    { id: "apo_1", estudianteId: "est_1", usuario: { nombre: "Persona apoderada" } },
  ]);
  prismaMock.reunionApoderados.findMany.mockResolvedValue([]);
  txMock.reunionApoderados.create.mockResolvedValue({ id: "reunion_1" });
  txMock.reunionApoderados.updateMany.mockResolvedValue({ count: 1 });
});

describe("crearReunionApoderados", () => {
  it("niega la creación a un rol no autorizado", async () => {
    sesion.user.rol = "APODERADO";

    const resultado = await crearReunionApoderados(entradaValida);

    expect(resultado.ok).toBe(false);
    expect(prismaMock.curso.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("limita al profesor jefe a su propio curso", async () => {
    prismaMock.curso.findFirst.mockResolvedValue(null);

    const resultado = await crearReunionApoderados(entradaValida);

    expect(resultado.ok).toBe(false);
    expect(prismaMock.curso.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          colegioId: "col_1",
          profesorJefeId: "u_1",
        }),
      }),
    );
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("crea acta y asistentes en una transacción sin PII en audit_log", async () => {
    const resultado = await crearReunionApoderados(entradaValida);

    expect(resultado).toEqual({ ok: true, id: "reunion_1" });
    expect(txMock.reunionApoderados.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          colegioId: "col_1",
          cursoId: "curso_1",
          asistentes: {
            create: [
              {
                colegioId: "col_1",
                apoderadoId: "apo_1",
                nombre: "Persona apoderada",
                estudianteId: "est_1",
              },
            ],
          },
        }),
      }),
    );
    const auditoria = auditoriaMock.mock.calls[0][0];
    expect(auditoria.despues).toMatchObject({ cantidadAsistentes: 1, tieneAcuerdos: true });
    expect(JSON.stringify(auditoria)).not.toContain("Persona apoderada");
    expect(JSON.stringify(auditoria)).not.toContain(entradaValida.acuerdos);
  });

  it("rechaza horas invertidas y fechas inexistentes", async () => {
    const horas = await crearReunionApoderados({
      ...entradaValida,
      horaInicio: "20:00",
      horaFin: "19:00",
    });
    const fecha = await crearReunionApoderados({ ...entradaValida, fecha: "2026-02-30" });

    expect(horas.ok).toBe(false);
    expect(fecha.ok).toBe(false);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("rechaza un apoderado que no pertenece al colegio/curso activo", async () => {
    prismaMock.apoderado.findMany.mockResolvedValue([]);

    const resultado = await crearReunionApoderados(entradaValida);

    expect(resultado.ok).toBe(false);
    expect(prismaMock.apoderado.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          estudiante: expect.objectContaining({ colegioId: "col_1" }),
        }),
      }),
    );
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});

describe("listarReunionesApoderados", () => {
  it("siempre filtra por colegio, curso y soft-delete", async () => {
    const resultado = await listarReunionesApoderados({ cursoId: "curso_1" });

    expect(resultado.ok).toBe(true);
    expect(prismaMock.reunionApoderados.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          colegioId: "col_1",
          cursoId: "curso_1",
          eliminadaEn: null,
        }),
      }),
    );
  });
});

describe("archivarReunionApoderados", () => {
  it("usa updateMany tenant-scoped para acta y asistentes, nunca delete", async () => {
    const resultado = await archivarReunionApoderados({ reunionId: "reunion_1" });

    expect(resultado.ok).toBe(true);
    expect(txMock.reunionApoderados.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "reunion_1", colegioId: "col_1", eliminadaEn: null },
      }),
    );
    expect(txMock.asistenteReunionApoderados.updateMany).toHaveBeenCalledOnce();
  });
});
