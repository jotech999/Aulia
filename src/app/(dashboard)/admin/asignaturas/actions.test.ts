import { describe, it, expect, vi, beforeEach } from "vitest";

const { sesion, prismaMock, txMock, auditoriaMock } = vi.hoisted(() => {
  const txMock = {
    asignatura: { update: vi.fn().mockResolvedValue({}) },
  };
  return {
    txMock,
    auditoriaMock: vi.fn(),
    sesion: { user: { id: "u1", rol: "DIRECTOR", colegioId: "col_1" } },
    prismaMock: {
      asignatura: {
        findFirst: vi.fn().mockResolvedValue({ id: "asig_1", color: null }),
      },
      $transaction: vi.fn(async (cb: (tx: typeof txMock) => Promise<void>) => cb(txMock)),
    },
  };
});

vi.mock("@/lib/sesion", () => ({ requerirSesion: vi.fn(async () => sesion) }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auditoria", () => ({ registrarAuditoria: auditoriaMock }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { actualizarColorAsignatura } from "./actions";

beforeEach(() => {
  vi.clearAllMocks();
  sesion.user.rol = "DIRECTOR";
  sesion.user.colegioId = "col_1";
  prismaMock.asignatura.findFirst.mockResolvedValue({ id: "asig_1", color: null });
});

describe("actualizarColorAsignatura — autorización", () => {
  it("un PROFESOR no puede configurar colores", async () => {
    sesion.user.rol = "PROFESOR";
    const r = await actualizarColorAsignatura({ asignaturaId: "asig_1", color: "rojo" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/permiso/i);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("no toca asignaturas de otro colegio (multi-tenant)", async () => {
    prismaMock.asignatura.findFirst.mockResolvedValue(null); // no está en el colegio
    const r = await actualizarColorAsignatura({ asignaturaId: "ajena", color: "rojo" });
    expect(r.ok).toBe(false);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});

describe("actualizarColorAsignatura — validación", () => {
  it("rechaza una clave de color fuera de la paleta", async () => {
    const r = await actualizarColorAsignatura({ asignaturaId: "asig_1", color: "fucsia" });
    expect(r.ok).toBe(false);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});

describe("actualizarColorAsignatura — caso feliz", () => {
  it("DIRECTOR fija un color y deja auditoría con antes/después", async () => {
    const r = await actualizarColorAsignatura({ asignaturaId: "asig_1", color: "violeta" });
    expect(r.ok).toBe(true);
    expect(txMock.asignatura.update).toHaveBeenCalledWith({
      where: { id: "asig_1" },
      data: { color: "violeta" },
    });
    expect(auditoriaMock).toHaveBeenCalledOnce();
    const arg = auditoriaMock.mock.calls[0][0];
    expect(arg).toMatchObject({
      accion: "MODIFICAR",
      entidad: "Asignatura",
      entidadId: "asig_1",
      antes: { color: null },
      despues: { color: "violeta" },
    });
  });

  it("una cadena vacía restaura la convención (color = null)", async () => {
    prismaMock.asignatura.findFirst.mockResolvedValue({ id: "asig_1", color: "rojo" });
    const r = await actualizarColorAsignatura({ asignaturaId: "asig_1", color: "" });
    expect(r.ok).toBe(true);
    expect(txMock.asignatura.update).toHaveBeenCalledWith({
      where: { id: "asig_1" },
      data: { color: null },
    });
  });

  it("si el color no cambia, no escribe ni audita", async () => {
    prismaMock.asignatura.findFirst.mockResolvedValue({ id: "asig_1", color: "azul" });
    const r = await actualizarColorAsignatura({ asignaturaId: "asig_1", color: "azul" });
    expect(r.ok).toBe(true);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(auditoriaMock).not.toHaveBeenCalled();
  });
});
