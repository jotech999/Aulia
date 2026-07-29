import { describe, it, expect } from "vitest";
import { puedePie, guardarFichaPieSchema } from "./pie";

describe("acceso PIE por rol (dato máximo sensible)", () => {
  it("permite al equipo PIE y dirección (caso feliz)", () => {
    for (const rol of ["ADMIN", "DIRECTOR", "PIE"]) {
      expect(puedePie(rol)).toBe(true);
    }
  });

  it("niega a todo el resto, incl. docentes e inspectoría (permiso denegado)", () => {
    for (const rol of ["PROFESOR", "PROFESOR_JEFE", "UTP", "INSPECTOR", "APODERADO"]) {
      expect(puedePie(rol)).toBe(false);
    }
  });
});

describe("guardarFichaPieSchema", () => {
  it("exige diagnóstico y estudiante", () => {
    expect(guardarFichaPieSchema.safeParse({ estudianteId: "e", diagnostico: "TEA nivel 1" }).success).toBe(true);
    expect(guardarFichaPieSchema.safeParse({ estudianteId: "e", diagnostico: "" }).success).toBe(false);
    expect(guardarFichaPieSchema.safeParse({ diagnostico: "x".repeat(5) }).success).toBe(false);
  });
});
