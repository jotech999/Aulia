import { describe, it, expect } from "vitest";
import { comandosPara, buscarComandos, COMANDOS } from "./comandos";

describe("comandosPara (alcance del buscador por rol)", () => {
  it("el staff ve las acciones frecuentes (caso feliz)", () => {
    const prof = comandosPara("PROFESOR").map((c) => c.href);
    expect(prof).toContain("/libro-clases/asistencia");
    expect(prof).toContain("/libro-clases/calificaciones");
    expect(prof).toContain("/dashboard");
  });

  it("el apoderado NO ve acciones de staff (permiso denegado)", () => {
    const apo = comandosPara("APODERADO");
    const hrefs = apo.map((c) => c.href);
    // Solo lo suyo: panel y comunicados.
    expect(hrefs).toContain("/dashboard");
    expect(hrefs).toContain("/comunicacion");
    // Nunca acciones de staff.
    expect(hrefs).not.toContain("/libro-clases/asistencia");
    expect(hrefs).not.toContain("/libro-clases/calificaciones");
    expect(hrefs).not.toContain("/admin/estudiantes");
    // El apoderado ve muchas menos acciones que el staff.
    expect(apo.length).toBeLessThan(comandosPara("ADMIN").length);
  });

  it("solo gestión puede abrir el editor de horario", () => {
    const href = "/libro-clases/horario?editar=1";
    expect(comandosPara("ADMIN").map((c) => c.href)).toContain(href);
    expect(comandosPara("UTP").map((c) => c.href)).toContain(href);
    expect(comandosPara("PROFESOR").map((c) => c.href)).not.toContain(href);
  });

  it("toda acción principal tiene un destino (no hay hrefs vacíos)", () => {
    for (const c of COMANDOS) {
      expect(c.href.startsWith("/")).toBe(true);
      expect(c.label.length).toBeGreaterThan(0);
    }
  });
});

describe("buscarComandos (2 teclas + Enter)", () => {
  it("encuentra la acción por nombre o sinónimo, tolerante a tildes", () => {
    expect(buscarComandos("PROFESOR", "notas")[0].href).toBe("/libro-clases/calificaciones");
    expect(buscarComandos("PROFESOR", "asistencia")[0].href).toBe("/libro-clases/asistencia");
    expect(buscarComandos("PROFESOR", "entrevista")[0].href).toBe("/convivencia/entrevistas/nueva");
    expect(buscarComandos("PROFESOR", "planificacion").length).toBeGreaterThan(0);
  });

  it("respeta el rol también al buscar (apoderado no alcanza notas)", () => {
    expect(buscarComandos("APODERADO", "notas")).toHaveLength(0);
  });

  it("encuentra editar horario solo para roles de gestión", () => {
    expect(buscarComandos("DIRECTOR", "editar horario")[0]?.href).toBe(
      "/libro-clases/horario?editar=1"
    );
    expect(buscarComandos("PROFESOR", "editar horario")).toHaveLength(0);
  });
});
