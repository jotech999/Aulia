import { describe, it, expect } from "vitest";
import {
  puedeCrearComunicado,
  alcancesPermitidos,
  puedeAlcance,
  puedeVerReporte,
  crearComunicadoSchema,
  claveBorradorComunicado,
} from "./comunicados";

describe("permisos de comunicado", () => {
  it("staff crea, apoderado no", () => {
    expect(puedeCrearComunicado("DIRECTOR")).toBe(true);
    expect(puedeCrearComunicado("PROFESOR")).toBe(true);
    expect(puedeCrearComunicado("INSPECTOR")).toBe(true);
    expect(puedeCrearComunicado("APODERADO")).toBe(false);
  });

  it("solo gestión emite a colegio/nivel", () => {
    expect(alcancesPermitidos("DIRECTOR")).toEqual([
      "COLEGIO",
      "NIVEL",
      "CURSO",
      "ESTUDIANTE",
      "SELECCION",
    ]);
    expect(alcancesPermitidos("PROFESOR_JEFE")).toEqual(["CURSO", "ESTUDIANTE", "SELECCION"]);
    expect(puedeAlcance("PROFESOR", "COLEGIO")).toBe(false);
    expect(puedeAlcance("PROFESOR", "CURSO")).toBe(true);
    expect(alcancesPermitidos("APODERADO")).toEqual([]);
  });

  it("reporte de lectura solo para gestión/inspector", () => {
    expect(puedeVerReporte("UTP")).toBe(true);
    expect(puedeVerReporte("INSPECTOR")).toBe(true);
    expect(puedeVerReporte("PROFESOR")).toBe(false);
    expect(puedeVerReporte("APODERADO")).toBe(false);
  });
});

describe("crearComunicadoSchema", () => {
  const base = { titulo: "Reunión", cuerpo: "Estimadas familias..." };
  it("exige el objetivo correcto por alcance", () => {
    expect(crearComunicadoSchema.safeParse({ ...base, alcance: "COLEGIO" }).success).toBe(true);
    expect(crearComunicadoSchema.safeParse({ ...base, alcance: "CURSO" }).success).toBe(false);
    expect(
      crearComunicadoSchema.safeParse({ ...base, alcance: "CURSO", cursoId: "c1" }).success
    ).toBe(true);
    expect(crearComunicadoSchema.safeParse({ ...base, alcance: "NIVEL" }).success).toBe(false);
    expect(
      crearComunicadoSchema.safeParse({ ...base, alcance: "NIVEL", nivel: "5B" }).success
    ).toBe(true);
    expect(
      crearComunicadoSchema.safeParse({ ...base, alcance: "ESTUDIANTE", estudianteId: "e1" }).success
    ).toBe(true);
    expect(crearComunicadoSchema.safeParse({ ...base, alcance: "SELECCION", estudianteIds: [] }).success).toBe(false);
    expect(crearComunicadoSchema.safeParse({ ...base, alcance: "SELECCION", estudianteIds: ["e1", "e2"] }).success).toBe(true);
  });
  it("rechaza título o cuerpo vacío", () => {
    expect(crearComunicadoSchema.safeParse({ titulo: "x", cuerpo: "y", alcance: "COLEGIO" }).success).toBe(false);
  });
});

describe("borrador local", () => {
  it("usa una clave distinta por usuario y colegio", () => {
    expect(claveBorradorComunicado("col_1:usr_1")).not.toBe(
      claveBorradorComunicado("col_2:usr_1")
    );
    expect(claveBorradorComunicado("col_1:usr_1")).not.toBe(
      claveBorradorComunicado("col_1:usr_2")
    );
  });
});
