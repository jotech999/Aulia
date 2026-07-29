import { describe, it, expect, vi, beforeEach } from "vitest";

const { sesion, prismaMock, txMock, auditoriaMock } = vi.hoisted(() => {
  const txMock = {
    eventoEscolar: {
      create: vi.fn().mockResolvedValue({ id: "ev_1" }),
      update: vi.fn().mockResolvedValue({}),
    },
  };
  return {
    txMock,
    auditoriaMock: vi.fn(),
    sesion: { user: { id: "u1", rol: "DIRECTOR", colegioId: "col_1" } },
    prismaMock: {
      curso: { findFirst: vi.fn().mockResolvedValue({ id: "curso_1" }) },
      eventoEscolar: { findFirst: vi.fn().mockResolvedValue({ id: "ev_1", titulo: "Acto" }) },
      $transaction: vi.fn(async (cb: (tx: typeof txMock) => Promise<unknown>) => cb(txMock)),
    },
  };
});

vi.mock("@/lib/sesion", () => ({ requerirSesion: vi.fn(async () => sesion) }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auditoria", () => ({ registrarAuditoria: auditoriaMock }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/notificaciones", () => ({
  notificarApoderadosDeCurso: vi.fn(),
  notificarApoderadosDeColegio: vi.fn(),
}));

import { crearEvento, eliminarEvento } from "./actions";
import { notificarApoderadosDeCurso, notificarApoderadosDeColegio } from "@/lib/notificaciones";

beforeEach(() => {
  vi.clearAllMocks();
  sesion.user.rol = "DIRECTOR";
  prismaMock.curso.findFirst.mockResolvedValue({ id: "curso_1" });
  prismaMock.eventoEscolar.findFirst.mockResolvedValue({ id: "ev_1", titulo: "Acto" });
});

describe("crearEvento — autorización", () => {
  it("un PROFESOR no puede crear eventos", async () => {
    sesion.user.rol = "PROFESOR";
    const r = await crearEvento({ titulo: "Reunión", fecha: "2026-08-01", tipo: "REUNION" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/permiso/i);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});

describe("crearEvento — validación", () => {
  it("rechaza título vacío", async () => {
    const r = await crearEvento({ titulo: "   ", fecha: "2026-08-01", tipo: "GENERAL" });
    expect(r.ok).toBe(false);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("rechaza una fecha inválida", async () => {
    const r = await crearEvento({ titulo: "Acto", fecha: "2026-13-40", tipo: "GENERAL" });
    expect(r.ok).toBe(false);
  });

  it("rechaza un curso de otro colegio", async () => {
    prismaMock.curso.findFirst.mockResolvedValue(null);
    const r = await crearEvento({ titulo: "Prueba", fecha: "2026-08-01", tipo: "EVALUACION", cursoId: "ajeno" });
    expect(r.ok).toBe(false);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});

describe("crearEvento — caso feliz", () => {
  it("DIRECTOR crea un evento y deja auditoría CREAR", async () => {
    const r = await crearEvento({
      titulo: "Reunión de apoderados",
      fecha: "2026-08-15",
      tipo: "REUNION",
    });
    expect(r.ok).toBe(true);
    expect(txMock.eventoEscolar.create).toHaveBeenCalledOnce();
    const arg = auditoriaMock.mock.calls[0][0];
    expect(arg).toMatchObject({ accion: "CREAR", entidad: "EventoEscolar" });
  });

  it("por defecto NO avisa a los apoderados", async () => {
    await crearEvento({ titulo: "Acto interno", fecha: "2026-08-01", tipo: "GENERAL" });
    expect(notificarApoderadosDeColegio).not.toHaveBeenCalled();
    expect(notificarApoderadosDeCurso).not.toHaveBeenCalled();
  });

  it("avisarApoderados sin curso notifica a todo el colegio", async () => {
    await crearEvento({ titulo: "Reunión de apoderados", fecha: "2026-08-01", tipo: "REUNION", avisarApoderados: true });
    expect(notificarApoderadosDeColegio).toHaveBeenCalledOnce();
    expect(notificarApoderadosDeCurso).not.toHaveBeenCalled();
  });

  it("avisarApoderados con curso notifica solo a ese curso", async () => {
    await crearEvento({ titulo: "Prueba", fecha: "2026-08-01", tipo: "EVALUACION", cursoId: "curso_1", avisarApoderados: true });
    expect(notificarApoderadosDeCurso).toHaveBeenCalledOnce();
    expect(notificarApoderadosDeColegio).not.toHaveBeenCalled();
  });
});

describe("eliminarEvento", () => {
  it("hace soft-delete (update eliminadaEn), nunca delete físico", async () => {
    const r = await eliminarEvento("ev_1");
    expect(r.ok).toBe(true);
    expect(txMock.eventoEscolar.update).toHaveBeenCalledOnce();
    const data = txMock.eventoEscolar.update.mock.calls[0][0].data;
    expect(data.eliminadaEn).toBeInstanceOf(Date);
  });

  it("un PROFESOR no puede eliminar", async () => {
    sesion.user.rol = "PROFESOR";
    const r = await eliminarEvento("ev_1");
    expect(r.ok).toBe(false);
  });
});
