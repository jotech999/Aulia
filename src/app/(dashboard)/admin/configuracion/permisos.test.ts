import { describe, it, expect } from "vitest";
import { puedeConfigurarColegio } from "./permisos";

describe("puedeConfigurarColegio", () => {
  it("permite a la dirección (caso feliz)", () => {
    expect(puedeConfigurarColegio("ADMIN")).toBe(true);
    expect(puedeConfigurarColegio("DIRECTOR")).toBe(true);
  });

  it("niega a roles no autorizados (permiso denegado)", () => {
    for (const rol of ["PROFESOR", "PROFESOR_JEFE", "UTP", "INSPECTOR", "APODERADO"]) {
      expect(puedeConfigurarColegio(rol)).toBe(false);
    }
  });
});
