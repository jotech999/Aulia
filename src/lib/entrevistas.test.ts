import { describe, it, expect } from "vitest";
import {
  esDireccionOInspector,
  rolElegibleEntrevistas,
  whereEstudiantesEntrevista,
  crearEntrevistaSchema,
} from "./entrevistas";

const colegioId = "col_1";

describe("acceso a entrevistas por rol", () => {
  it("dirección e inspectoría son elegibles (caso feliz)", () => {
    for (const rol of ["ADMIN", "DIRECTOR", "UTP", "INSPECTOR"]) {
      expect(esDireccionOInspector(rol)).toBe(true);
      expect(rolElegibleEntrevistas(rol)).toBe(true);
    }
  });

  it("los docentes son elegibles pero acotados a sus estudiantes", () => {
    expect(rolElegibleEntrevistas("PROFESOR")).toBe(true);
    const w = whereEstudiantesEntrevista({ id: "p1", rol: "PROFESOR", colegioId });
    expect(w.colegioId).toBe(colegioId);
    expect(w.matriculas).toBeDefined(); // exige pertenencia al curso
  });

  it("el apoderado NUNCA accede a entrevistas (permiso denegado)", () => {
    expect(rolElegibleEntrevistas("APODERADO")).toBe(false);
    expect(esDireccionOInspector("APODERADO")).toBe(false);
  });

  it("la dirección ve todo el colegio, sin filtro de pertenencia", () => {
    const w = whereEstudiantesEntrevista({ id: "d1", rol: "DIRECTOR", colegioId });
    expect(w).toEqual({ colegioId });
  });
});

describe("crearEntrevistaSchema", () => {
  it("acepta una entrevista válida", () => {
    const r = crearEntrevistaSchema.safeParse({
      estudianteId: "est_1",
      apoderado: "Claudia Rojas",
      motivo: "Rendimiento",
      fecha: "2026-07-15",
    });
    expect(r.success).toBe(true);
  });

  it("rechaza datos inválidos (motivo vacío, fecha mala)", () => {
    expect(crearEntrevistaSchema.safeParse({ estudianteId: "e", apoderado: "x", motivo: "", fecha: "15-07" }).success).toBe(false);
  });
});
