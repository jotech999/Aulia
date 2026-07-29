import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks: aislar la lógica de autorización/minimización del SDK y la BD. ---
// (vi.mock se iza al tope: las variables compartidas se crean con vi.hoisted.)
const { finalMessage, prismaMock, registrarAuditoria } = vi.hoisted(() => ({
  finalMessage: vi.fn(),
  prismaMock: {
    asignatura: { findFirst: vi.fn() },
    oa: { findMany: vi.fn() },
    curso: { findFirst: vi.fn() },
  },
  registrarAuditoria: vi.fn(),
}));

vi.mock("./cliente", () => ({
  IA_MODELO: "claude-opus-4-8",
  iaDisponible: vi.fn(() => true),
  clienteIA: vi.fn(() => ({
    messages: { stream: () => ({ finalMessage }) },
  })),
  conReintento: <T>(fn: () => Promise<T>) => fn(),
  mensajeErrorIA: () => ({ config: false, mensaje: "error" }),
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auditoria", () => ({ registrarAuditoria: (...a: unknown[]) => registrarAuditoria(...a) }));

import { generarBorradorDocente } from "./docente";
import { iaDisponible } from "./cliente";

const user = { id: "prof_1", rol: "PROFESOR", colegioId: "col_1" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(iaDisponible).mockReturnValue(true);
  finalMessage.mockResolvedValue({ content: [{ type: "text", text: "Borrador de prueba" }] });
});

describe("generarBorradorDocente — degradación segura", () => {
  it("sin ANTHROPIC_API_KEY no llama al modelo y avisa", async () => {
    vi.mocked(iaDisponible).mockReturnValue(false);
    const res = await generarBorradorDocente(user, {
      tipo: "comunicado",
      proposito: "Reunión",
      audiencia: "Apoderados",
      puntos: "Fecha y hora",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("ANTHROPIC_API_KEY");
    expect(finalMessage).not.toHaveBeenCalled();
  });
});

describe("generarBorradorDocente — autorización (multi-tenant)", () => {
  it("rechaza planificación sobre una asignatura fuera del alcance del docente", async () => {
    prismaMock.asignatura.findFirst.mockResolvedValue(null); // no accesible
    const res = await generarBorradorDocente(user, {
      tipo: "planificacion",
      asignaturaId: "asig_ajena",
      titulo: "Fracciones",
      numeroClases: 6,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/acceso/i);
    // Reautorización acotada al colegio del usuario (regla multi-tenant).
    expect(prismaMock.asignatura.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ colegioId: "col_1" }) })
    );
    expect(finalMessage).not.toHaveBeenCalled();
  });
});

describe("generarBorradorDocente — caso feliz", () => {
  it("genera el borrador de planificación con OA del nivel y audita el uso", async () => {
    prismaMock.asignatura.findFirst.mockResolvedValue({
      nombre: "Matemática",
      curso: { nivel: "5B" },
    });
    prismaMock.oa.findMany.mockResolvedValue([
      { codigo: "MA05 OA 07", eje: "Números", descripcion: "Fracciones" },
    ]);

    const res = await generarBorradorDocente(user, {
      tipo: "planificacion",
      asignaturaId: "asig_1",
      titulo: "Fracciones",
      numeroClases: 6,
    });

    expect(res.ok).toBe(true);
    if (res.ok) expect(res.borrador).toBe("Borrador de prueba");
    // Minimización: al OA solo se le piden campos sin PII.
    expect(prismaMock.oa.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ select: { codigo: true, eje: true, descripcion: true } })
    );
    // El uso queda auditado como CONSULTAR_IA (sin PII).
    expect(registrarAuditoria).toHaveBeenCalledWith(
      expect.objectContaining({ accion: "CONSULTAR_IA", colegioId: "col_1" })
    );
  });
});
