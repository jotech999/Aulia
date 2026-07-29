import { describe, it, expect } from "vitest";
import {
  autorizarEmision,
  puedeAnular,
  rutEnmascarado,
  nombreParcial,
  formatearFolio,
  esInforme,
} from "./certificados";

describe("informes (boletín semestral/anual)", () => {
  const curso = { profesorJefeId: "jefe-1" };
  it("esInforme distingue informes de notas del alumno regular", () => {
    expect(esInforme("NOTAS_PARCIALES")).toBe(true);
    expect(esInforme("INFORME_SEMESTRAL")).toBe(true);
    expect(esInforme("INFORME_ANUAL")).toBe(true);
    expect(esInforme("ALUMNO_REGULAR")).toBe(false);
  });
  it("informe semestral/anual: mismo criterio que notas parciales", () => {
    expect(autorizarEmision("INFORME_SEMESTRAL", "PROFESOR_JEFE", "jefe-1", curso)).toBe(true);
    expect(autorizarEmision("INFORME_ANUAL", "PROFESOR_JEFE", "otro", curso)).toBe(false);
    expect(autorizarEmision("INFORME_SEMESTRAL", "UTP", "x", curso)).toBe(true);
    expect(autorizarEmision("INFORME_ANUAL", "APODERADO", "x", curso)).toBe(false);
  });
});

describe("autorizarEmision", () => {
  const curso = { profesorJefeId: "jefe-1" };
  it("dirección y admin emiten cualquier tipo", () => {
    expect(autorizarEmision("ALUMNO_REGULAR", "DIRECTOR", "x", curso)).toBe(true);
    expect(autorizarEmision("NOTAS_PARCIALES", "ADMIN", "x", curso)).toBe(true);
  });
  it("alumno regular: UTP e inspector sí, profesor no", () => {
    expect(autorizarEmision("ALUMNO_REGULAR", "UTP", "x", curso)).toBe(true);
    expect(autorizarEmision("ALUMNO_REGULAR", "INSPECTOR", "x", curso)).toBe(true);
    expect(autorizarEmision("ALUMNO_REGULAR", "PROFESOR", "x", curso)).toBe(false);
    expect(autorizarEmision("ALUMNO_REGULAR", "PROFESOR_JEFE", "jefe-1", curso)).toBe(false);
  });
  it("notas parciales: profesor jefe solo de su curso", () => {
    expect(autorizarEmision("NOTAS_PARCIALES", "PROFESOR_JEFE", "jefe-1", curso)).toBe(true);
    expect(autorizarEmision("NOTAS_PARCIALES", "PROFESOR_JEFE", "otro", curso)).toBe(false);
    expect(autorizarEmision("NOTAS_PARCIALES", "UTP", "x", curso)).toBe(true);
    expect(autorizarEmision("NOTAS_PARCIALES", "INSPECTOR", "x", curso)).toBe(false);
  });
  it("apoderado nunca emite", () => {
    expect(autorizarEmision("ALUMNO_REGULAR", "APODERADO", "x", curso)).toBe(false);
    expect(autorizarEmision("NOTAS_PARCIALES", "APODERADO", "x", curso)).toBe(false);
  });
});

describe("puedeAnular", () => {
  it("solo dirección/admin", () => {
    expect(puedeAnular("DIRECTOR")).toBe(true);
    expect(puedeAnular("ADMIN")).toBe(true);
    expect(puedeAnular("UTP")).toBe(false);
    expect(puedeAnular("PROFESOR_JEFE")).toBe(false);
  });
});

describe("rutEnmascarado", () => {
  it("oculta el cuerpo dejando el DV y el último dígito", () => {
    expect(rutEnmascarado("12345678-9")).toBe("*******8-9");
    expect(rutEnmascarado("9876543-2")).toBe("******3-2");
  });
  it("maneja RUT inválido sin filtrar datos", () => {
    expect(rutEnmascarado("basura")).toBe("***");
  });
});

describe("nombreParcial", () => {
  it("muestra primer nombre e inicial del apellido", () => {
    expect(nombreParcial("Martina Isidora", "González Rojas")).toBe("Martina G.");
    expect(nombreParcial("Tomás", "Espinoza")).toBe("Tomás E.");
  });
});

describe("formatearFolio", () => {
  it("rellena con ceros a 6 dígitos", () => {
    expect(formatearFolio(1)).toBe("N°000001");
    expect(formatearFolio(123)).toBe("N°000123");
  });
});
