import { beforeEach, describe, expect, it, vi } from "vitest";

const { sesion, prismaMock, txMock, auditoriaMock, revalidateMock } = vi.hoisted(
  () => {
    const txMock = {
      curso: { findFirst: vi.fn() },
      asignatura: { findFirst: vi.fn() },
      horarioCurso: { findUnique: vi.fn(), create: vi.fn() },
      horarioVersion: { findFirst: vi.fn(), aggregate: vi.fn(), create: vi.fn(), update: vi.fn() },
      bloqueHorario: {
        findFirst: vi.fn(),
        create: vi.fn(),
        createMany: vi.fn(),
        update: vi.fn(),
      },
    };
    return {
      txMock,
      auditoriaMock: vi.fn(),
      revalidateMock: vi.fn(),
      sesion: {
        user: { id: "u1", rol: "DIRECTOR", colegioId: "col_1" },
      },
      prismaMock: {
        $transaction: vi.fn(
          async (cb: (tx: typeof txMock) => Promise<unknown>) => cb(txMock)
        ),
      },
    };
  }
);

vi.mock("@/lib/sesion", () => ({ requerirSesion: vi.fn(async () => sesion) }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auditoria", () => ({ registrarAuditoria: auditoriaMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidateMock }));

import {
  actualizarBloqueHorario,
  crearBloqueHorario,
  crearVersionHorario,
  eliminarBloqueHorario,
  publicarVersionHorario,
} from "./actions";

const entrada = {
  asignaturaId: "asig_1",
  dia: 1,
  horaInicio: "08:00",
  horaFin: "08:45",
  horarioVersionId: "version_1",
};

const asignatura = {
  id: "asig_1",
  cursoId: "curso_1",
  docenteId: "doc_1",
  nombre: "Matemática",
  color: "azul",
};

const bloqueRespuesta = {
  id: "bloque_1",
  ...entrada,
  asignatura: { nombre: "Matemática", color: "azul" },
};

const bloqueActual = {
  id: "bloque_1",
  ...entrada,
  asignatura: { cursoId: "curso_1" },
  _count: { clases: 0 },
  horarioVersionId: "version_1",
  horarioVersion: { estado: "BORRADOR" },
};

beforeEach(() => {
  vi.clearAllMocks();
  sesion.user.rol = "DIRECTOR";
  sesion.user.colegioId = "col_1";
  txMock.asignatura.findFirst.mockResolvedValue(asignatura);
  txMock.curso.findFirst.mockResolvedValue({ id: "curso_1", anioEscolar: { anio: 2026 } });
  txMock.horarioCurso.findUnique.mockResolvedValue({ id: "horario_1" });
  txMock.horarioCurso.create.mockResolvedValue({ id: "horario_1" });
  txMock.horarioVersion.findFirst.mockResolvedValue({ id: "version_1" });
  txMock.horarioVersion.aggregate.mockResolvedValue({ _max: { numero: 1 } });
  txMock.horarioVersion.create.mockResolvedValue({ id: "version_1" });
  txMock.horarioVersion.update.mockResolvedValue({ id: "version_1" });
  txMock.bloqueHorario.findFirst.mockResolvedValue(null);
  txMock.bloqueHorario.create.mockResolvedValue(bloqueRespuesta);
  txMock.bloqueHorario.update.mockResolvedValue(bloqueRespuesta);
});

describe("versiones de horario", () => {
  it("crea un borrador copiando únicamente los bloques activos de la versión publicada", async () => {
    txMock.horarioVersion.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "version_1", bloques: [{ asignaturaId: "asig_1", dia: 1, horaInicio: "08:00", horaFin: "08:45", horaInicioMin: 480, horaFinMin: 525 }] });
    txMock.horarioVersion.create.mockResolvedValue({ id: "version_2", numero: 2 });
    txMock.bloqueHorario.createMany.mockResolvedValue({ count: 1 });

    const resultado = await crearVersionHorario({ cursoId: "curso_1", vigenteDesde: "2026-08-01" });

    expect(resultado).toEqual({ ok: true, versionId: "version_2" });
    expect(txMock.bloqueHorario.createMany).toHaveBeenCalledWith({ data: [expect.objectContaining({ colegioId: "col_1", horarioVersionId: "version_2", asignaturaId: "asig_1" })] });
    expect(auditoriaMock).toHaveBeenCalledOnce();
  });

  it("publica una versión no vacía y cierra la vigencia anterior", async () => {
    txMock.horarioVersion.findFirst
      .mockResolvedValueOnce({ id: "version_2", horarioCursoId: "horario_1", vigenteDesde: new Date("2026-08-01T00:00:00Z"), numero: 2, horarioCurso: { curso: { anioEscolar: { anio: 2026 } } }, _count: { bloques: 5 } })
      .mockResolvedValueOnce({ id: "version_1", vigenteHasta: null });

    const resultado = await publicarVersionHorario("version_2");

    expect(resultado).toEqual({ ok: true });
    expect(txMock.horarioVersion.update).toHaveBeenCalledTimes(2);
    expect(auditoriaMock).toHaveBeenCalledWith(expect.objectContaining({ entidadId: "version_1", antes: { vigenteHasta: null }, despues: expect.objectContaining({ causa: "NUEVA_VERSION_PUBLICADA" }) }), txMock);
    expect(auditoriaMock).toHaveBeenCalledWith(expect.objectContaining({ accion: "MODIFICAR", entidad: "HorarioVersion", entidadId: "version_2" }), txMock);
  });
});

describe("crearBloqueHorario", () => {
  it("exige una versión en borrador para no alterar el horario publicado", async () => {
    const sinVersion = {
      asignaturaId: entrada.asignaturaId,
      dia: entrada.dia,
      horaInicio: entrada.horaInicio,
      horaFin: entrada.horaFin,
    };

    const resultado = await crearBloqueHorario(sinVersion);

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error).toMatch(/borrador/i);
    expect(txMock.bloqueHorario.create).not.toHaveBeenCalled();
  });

  it("crea un bloque tenant-scoped y lo audita", async () => {
    const resultado = await crearBloqueHorario(entrada);

    expect(resultado.ok).toBe(true);
    expect(txMock.asignatura.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "asig_1", colegioId: "col_1" },
      })
    );
    expect(txMock.bloqueHorario.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ...entrada,
          colegioId: "col_1",
          horarioVersionId: "version_1",
          horaInicioMin: 480,
          horaFinMin: 525,
        }),
      })
    );
    expect(auditoriaMock).toHaveBeenCalledWith(
      expect.objectContaining({
        accion: "CREAR",
        entidad: "BloqueHorario",
        entidadId: "bloque_1",
        colegioId: "col_1",
      }),
      txMock
    );
    expect(revalidateMock).toHaveBeenCalledWith("/dashboard");
  });

  it("rechaza a un profesor antes de abrir una transacción", async () => {
    sesion.user.rol = "PROFESOR";
    const resultado = await crearBloqueHorario(entrada);

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error).toMatch(/permiso/i);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("no permite usar una asignatura de otro colegio", async () => {
    txMock.asignatura.findFirst.mockResolvedValue(null);
    const resultado = await crearBloqueHorario(entrada);

    expect(resultado.ok).toBe(false);
    expect(txMock.bloqueHorario.create).not.toHaveBeenCalled();
    expect(auditoriaMock).not.toHaveBeenCalled();
  });

  it("rechaza horas inválidas antes de consultar datos", async () => {
    const resultado = await crearBloqueHorario({
      ...entrada,
      horaInicio: "9:00",
      horaFin: "08:00",
    });

    expect(resultado.ok).toBe(false);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("rechaza un solape del curso", async () => {
    txMock.bloqueHorario.findFirst.mockResolvedValueOnce({ id: "ocupado" });
    const resultado = await crearBloqueHorario(entrada);

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error).toMatch(/curso/i);
    expect(txMock.bloqueHorario.create).not.toHaveBeenCalled();
  });

  it("rechaza un solape del docente en otro curso", async () => {
    txMock.bloqueHorario.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "ocupado" });
    const resultado = await crearBloqueHorario(entrada);

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error).toMatch(/docente/i);
    expect(txMock.bloqueHorario.create).not.toHaveBeenCalled();
  });

  it("consulta el solape como intervalo y permite bloques contiguos", async () => {
    const resultado = await crearBloqueHorario({
      ...entrada,
      horaInicio: "08:45",
      horaFin: "09:30",
    });

    expect(resultado.ok).toBe(true);
    expect(txMock.bloqueHorario.findFirst).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          horaInicio: { lt: "09:30" },
          horaFin: { gt: "08:45" },
        }),
      })
    );
  });
});

describe("actualizarBloqueHorario", () => {
  it("excluye el propio bloque al validar cruces y audita antes/después", async () => {
    txMock.bloqueHorario.update.mockResolvedValue({
      ...bloqueRespuesta,
      dia: 2,
    });
    txMock.bloqueHorario.findFirst
      .mockResolvedValueOnce(bloqueActual)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    const resultado = await actualizarBloqueHorario({
      ...entrada,
      bloqueId: "bloque_1",
      dia: 2,
    });

    expect(resultado.ok).toBe(true);
    expect(txMock.bloqueHorario.findFirst).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({ id: { not: "bloque_1" }, dia: 2 }),
      })
    );
    expect(auditoriaMock).toHaveBeenCalledWith(
      expect.objectContaining({
        accion: "MODIFICAR",
        antes: expect.objectContaining({ dia: 1 }),
        despues: expect.objectContaining({ dia: 2 }),
      }),
      txMock
    );
  });

  it("mantiene inmutable un bloque que ya referencia clases", async () => {
    txMock.bloqueHorario.findFirst.mockResolvedValueOnce({
      ...bloqueActual,
      _count: { clases: 1 },
    });
    const resultado = await actualizarBloqueHorario({
      ...entrada,
      bloqueId: "bloque_1",
      dia: 2,
    });

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error).toMatch(/clases registradas/i);
    expect(txMock.bloqueHorario.update).not.toHaveBeenCalled();
  });
});

describe("eliminarBloqueHorario", () => {
  it("desactiva y audita un bloque nunca utilizado", async () => {
    txMock.bloqueHorario.findFirst.mockResolvedValueOnce(bloqueActual);
    const resultado = await eliminarBloqueHorario({ bloqueId: "bloque_1" });

    expect(resultado.ok).toBe(true);
    expect(txMock.bloqueHorario.update).toHaveBeenCalledWith({
      where: { id: "bloque_1" },
      data: {
        eliminadaEn: expect.any(Date),
        eliminadaPorId: "u1",
      },
    });
    expect(auditoriaMock).toHaveBeenCalledWith(
      expect.objectContaining({ accion: "ELIMINAR", entidadId: "bloque_1" }),
      txMock
    );
  });

  it("no desactiva un bloque vinculado a una clase", async () => {
    txMock.bloqueHorario.findFirst.mockResolvedValueOnce({
      ...bloqueActual,
      _count: { clases: 2 },
    });
    const resultado = await eliminarBloqueHorario({ bloqueId: "bloque_1" });

    expect(resultado.ok).toBe(false);
    expect(txMock.bloqueHorario.update).not.toHaveBeenCalled();
    expect(auditoriaMock).not.toHaveBeenCalled();
  });
});
