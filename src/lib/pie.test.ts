import { describe, it, expect } from "vitest";
import {
  puedePie,
  puedeVerApoyosAula,
  guardarFichaPieSchema,
  ROLES_APOYOS_AULA,
  ROLES_PIE,
} from "./pie";

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

/**
 * El PIE tiene DOS niveles de acceso, y la diferencia entre ellos es lo que
 * separa un dato de salud de una instrucción pedagógica. La ficha completa
 * (diagnóstico) sigue reservada; las adecuaciones de aula las ve quien tiene
 * que aplicarlas. Estas pruebas fijan esa frontera para que no se corra sola.
 */
describe("adecuaciones de aula: el segundo nivel de acceso", () => {
  it("quien hace clases las ve, porque es quien debe aplicarlas", () => {
    for (const rol of ["PROFESOR", "PROFESOR_JEFE", "UTP"]) {
      expect(puedeVerApoyosAula(rol)).toBe(true);
      // …pero sin acceder nunca a la ficha completa.
      expect(puedePie(rol)).toBe(false);
    }
  });

  it("el equipo PIE y la dirección también las ven", () => {
    for (const rol of ["ADMIN", "DIRECTOR", "PIE"]) {
      expect(puedeVerApoyosAula(rol)).toBe(true);
    }
  });

  it("las familias, los estudiantes y el sostenedor quedan fuera", () => {
    for (const rol of ["APODERADO", "ESTUDIANTE", "SOSTENEDOR"]) {
      expect(puedeVerApoyosAula(rol)).toBe(false);
    }
  });

  it("inspectoría queda fuera: no hace clases, no aplica adecuaciones", () => {
    expect(puedeVerApoyosAula("INSPECTOR")).toBe(false);
  });

  it("quien ve la ficha completa ve también las adecuaciones (sin huecos)", () => {
    for (const rol of ROLES_PIE) {
      expect(ROLES_APOYOS_AULA.has(rol)).toBe(true);
    }
  });

  it("un rol desconocido no gana acceso por omisión", () => {
    expect(puedeVerApoyosAula("")).toBe(false);
    expect(puedeVerApoyosAula("SUPERUSUARIO")).toBe(false);
  });
});

describe("guardarFichaPieSchema", () => {
  it("exige diagnóstico y estudiante", () => {
    expect(guardarFichaPieSchema.safeParse({ estudianteId: "e", diagnostico: "TEA nivel 1" }).success).toBe(true);
    expect(guardarFichaPieSchema.safeParse({ estudianteId: "e", diagnostico: "" }).success).toBe(false);
    expect(guardarFichaPieSchema.safeParse({ diagnostico: "x".repeat(5) }).success).toBe(false);
  });
});
