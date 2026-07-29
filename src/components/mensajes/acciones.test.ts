import { describe, it, expect, vi, beforeEach } from "vitest";

const { sesion, prismaMock, participacionMock, notiEstMock, crearNotifMock } = vi.hoisted(() => ({
  sesion: { user: { id: "u1", rol: "APODERADO", colegioId: "col_1" } },
  prismaMock: {
    mensajeDirecto: { create: vi.fn().mockResolvedValue({ id: "m1" }), updateMany: vi.fn() },
    estudiante: {
      findFirst: vi.fn().mockResolvedValue({
        nombres: "Valentina",
        matriculas: [{ curso: { profesorJefeId: "prof1" } }],
      }),
    },
  },
  participacionMock: vi.fn(),
  notiEstMock: vi.fn(),
  crearNotifMock: vi.fn(),
}));

vi.mock("@/lib/sesion", () => ({ requerirSesion: vi.fn(async () => sesion) }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/mensajes", () => ({ participacionEnHilo: participacionMock }));
vi.mock("@/lib/notificaciones", () => ({
  notificarApoderadosDeEstudiante: notiEstMock,
  crearNotificaciones: crearNotifMock,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { enviarMensaje } from "./acciones";

beforeEach(() => {
  vi.clearAllMocks();
  sesion.user.rol = "APODERADO";
  participacionMock.mockResolvedValue({ esApoderado: true });
});

describe("enviarMensaje — autorización", () => {
  it("no envía si el usuario no participa del hilo", async () => {
    participacionMock.mockResolvedValue(null);
    const r = await enviarMensaje({ estudianteId: "est_1", cuerpo: "Hola" });
    expect(r.ok).toBe(false);
    expect(prismaMock.mensajeDirecto.create).not.toHaveBeenCalled();
  });
});

describe("enviarMensaje — validación", () => {
  it("rechaza un mensaje vacío", async () => {
    const r = await enviarMensaje({ estudianteId: "est_1", cuerpo: "   " });
    expect(r.ok).toBe(false);
    expect(prismaMock.mensajeDirecto.create).not.toHaveBeenCalled();
  });
});

describe("enviarMensaje — envío", () => {
  it("apoderado envía y avisa al profesor jefe", async () => {
    const r = await enviarMensaje({ estudianteId: "est_1", cuerpo: "¿Cómo va Valentina?" });
    expect(r.ok).toBe(true);
    expect(prismaMock.mensajeDirecto.create).toHaveBeenCalledOnce();
    const data = prismaMock.mensajeDirecto.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ estudianteId: "est_1", deApoderado: true, autorId: "u1" });
    expect(crearNotifMock).toHaveBeenCalledOnce(); // aviso al profesor jefe
    expect(notiEstMock).not.toHaveBeenCalled();
  });

  it("docente envía y avisa a los apoderados del estudiante", async () => {
    sesion.user.rol = "PROFESOR_JEFE";
    participacionMock.mockResolvedValue({ esApoderado: false });
    const r = await enviarMensaje({ estudianteId: "est_1", cuerpo: "Va muy bien." });
    expect(r.ok).toBe(true);
    const data = prismaMock.mensajeDirecto.create.mock.calls[0][0].data;
    expect(data.deApoderado).toBe(false);
    expect(notiEstMock).toHaveBeenCalledOnce(); // aviso a apoderados
    expect(crearNotifMock).not.toHaveBeenCalled();
  });
});
