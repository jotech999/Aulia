import { describe, it, expect, vi, beforeEach } from "vitest";

const { sesion, prismaMock, txMock } = vi.hoisted(() => {
  const txMock = {
    estudiante: { create: vi.fn().mockResolvedValue({ id: "est_new" }) },
    matricula: { create: vi.fn().mockResolvedValue({ id: "mat_new" }) },
    usuario: { findUnique: vi.fn(), create: vi.fn().mockResolvedValue({ id: "apo_new" }) },
    membresia: { upsert: vi.fn() },
    apoderado: { create: vi.fn().mockResolvedValue({ id: "apo_link" }) },
  };
  return {
    txMock,
    sesion: { user: { id: "adm1", rol: "ADMIN", colegioId: "col1" } },
    prismaMock: {
      curso: { findFirst: vi.fn().mockResolvedValue({ id: "curso1" }) },
      estudiante: { findFirst: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn(async (cb: (tx: typeof txMock) => Promise<unknown>) => cb(txMock)),
    },
  };
});

vi.mock("@/lib/sesion", () => ({ requerirSesion: vi.fn(async () => sesion) }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auditoria", () => ({ registrarAuditoria: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("bcryptjs", () => ({ default: { hash: vi.fn(async () => "hash") } }));

import { crearMatricula } from "./actions";

// RUT válido (dígito verificador correcto)
const RUT_EST = "11111111-1";
const RUT_APO = "12345678-5";

beforeEach(() => {
  vi.clearAllMocks();
  sesion.user.rol = "ADMIN";
  prismaMock.curso.findFirst.mockResolvedValue({ id: "curso1" });
  prismaMock.estudiante.findFirst.mockResolvedValue(null);
  txMock.usuario.findUnique.mockResolvedValue(null);
});

describe("crearMatricula", () => {
  it("caso feliz: crea estudiante y matrícula", async () => {
    const res = await crearMatricula({ rut: RUT_EST, nombres: "Ana", apellidos: "Pérez", cursoId: "curso1" });
    expect(res.ok).toBe(true);
    expect(txMock.estudiante.create).toHaveBeenCalledTimes(1);
    expect(txMock.matricula.create).toHaveBeenCalledTimes(1);
    expect(txMock.apoderado.create).not.toHaveBeenCalled();
  });

  it("con apoderado nuevo: crea usuario + membresía + vínculo y devuelve clave temporal", async () => {
    const res = await crearMatricula({
      rut: RUT_EST, nombres: "Ana", apellidos: "Pérez", cursoId: "curso1",
      apoderado: { rut: RUT_APO, nombre: "Mamá", email: "mama@x.cl", parentesco: "madre" },
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.apoderadoClaveTemporal).toMatch(/^Aulia-[A-Z2-9]{8}$/);
    expect(txMock.usuario.create).toHaveBeenCalledTimes(1);
    expect(txMock.membresia.upsert).toHaveBeenCalledTimes(1);
    expect(txMock.apoderado.create).toHaveBeenCalledTimes(1);
  });

  it("seguridad: no enlaza si el RUT del apoderado ya existe con OTRO email", async () => {
    // Primera búsqueda (por RUT) devuelve una cuenta con distinto email.
    txMock.usuario.findUnique.mockResolvedValueOnce({ id: "otro", email: "distinto@x.cl" });
    const res = await crearMatricula({
      rut: RUT_EST, nombres: "Ana", apellidos: "Pérez", cursoId: "curso1",
      apoderado: { rut: RUT_APO, nombre: "Mamá", email: "mama@x.cl", parentesco: "madre" },
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/otro email/i);
    expect(txMock.apoderado.create).not.toHaveBeenCalled();
    expect(txMock.usuario.create).not.toHaveBeenCalled();
  });

  it("enlaza una cuenta existente solo si RUT y email coinciden (sin clave nueva)", async () => {
    txMock.usuario.findUnique.mockResolvedValueOnce({ id: "apo_exist", email: "mama@x.cl" });
    const res = await crearMatricula({
      rut: RUT_EST, nombres: "Ana", apellidos: "Pérez", cursoId: "curso1",
      apoderado: { rut: RUT_APO, nombre: "Mamá", email: "mama@x.cl", parentesco: "madre" },
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.apoderadoClaveTemporal).toBeUndefined();
    expect(txMock.usuario.create).not.toHaveBeenCalled();
    expect(txMock.apoderado.create).toHaveBeenCalledTimes(1);
  });

  it("rechaza RUT de estudiante inválido", async () => {
    const res = await crearMatricula({ rut: "12345678-9", nombres: "Ana", apellidos: "Pérez", cursoId: "curso1" });
    expect(res.ok).toBe(false);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("multi-tenant: curso de otro colegio no existe → error", async () => {
    prismaMock.curso.findFirst.mockResolvedValue(null);
    const res = await crearMatricula({ rut: RUT_EST, nombres: "Ana", apellidos: "Pérez", cursoId: "ajeno" });
    expect(res.ok).toBe(false);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("permiso denegado: un profesor no puede matricular", async () => {
    sesion.user.rol = "PROFESOR";
    const res = await crearMatricula({ rut: RUT_EST, nombres: "Ana", apellidos: "Pérez", cursoId: "curso1" });
    expect(res.ok).toBe(false);
    expect(prismaMock.curso.findFirst).not.toHaveBeenCalled();
  });
});
