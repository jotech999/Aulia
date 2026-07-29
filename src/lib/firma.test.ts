import { describe, it, expect } from "vitest";
import {
  autorizarRegistroClase,
  autorizarRectificacion,
  guardarClaseSchema,
  rectificarClaseSchema,
} from "./firma";

const asig = { docenteId: "prof-1", profesorJefeId: "jefe-1" };

describe("autorizarRegistroClase", () => {
  it("permite a UTP/Director/Admin (subrogancia)", () => {
    expect(autorizarRegistroClase("UTP", "x", asig)).toBe(true);
    expect(autorizarRegistroClase("DIRECTOR", "x", asig)).toBe(true);
    expect(autorizarRegistroClase("ADMIN", "x", asig)).toBe(true);
  });
  it("permite al docente de la asignatura y al profesor jefe del curso", () => {
    expect(autorizarRegistroClase("PROFESOR", "prof-1", asig)).toBe(true);
    expect(autorizarRegistroClase("PROFESOR_JEFE", "jefe-1", asig)).toBe(true);
  });
  it("niega a un profesor ajeno al curso", () => {
    expect(autorizarRegistroClase("PROFESOR", "otro", asig)).toBe(false);
  });
  it("niega a inspector y apoderado", () => {
    expect(autorizarRegistroClase("INSPECTOR", "prof-1", asig)).toBe(false);
    expect(autorizarRegistroClase("APODERADO", "prof-1", asig)).toBe(false);
  });
});

describe("autorizarRectificacion (clase firmada)", () => {
  it("permite a rol elevado", () => {
    expect(
      autorizarRectificacion("UTP", "x", { firmadaPorId: "prof-1" })
    ).toBe(true);
  });
  it("permite a quien firmó", () => {
    expect(
      autorizarRectificacion("PROFESOR", "prof-1", { firmadaPorId: "prof-1" })
    ).toBe(true);
  });
  it("niega a otro docente que no firmó", () => {
    expect(
      autorizarRectificacion("PROFESOR", "otro", { firmadaPorId: "prof-1" })
    ).toBe(false);
  });
});

describe("guardarClaseSchema", () => {
  it("acepta un registro válido con OA opcionales", () => {
    const r = guardarClaseSchema.safeParse({
      asignaturaId: "a",
      fecha: "2026-04-10",
      contenido: "Fracciones equivalentes",
      oaIds: ["MA05 OA 07"],
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.bloqueHorarioId).toBeNull();
  });
  it("rechaza contenido vacío o fecha inexistente", () => {
    expect(
      guardarClaseSchema.safeParse({
        asignaturaId: "a",
        fecha: "2026-04-10",
        contenido: "x",
      }).success
    ).toBe(false);
    expect(
      guardarClaseSchema.safeParse({
        asignaturaId: "a",
        fecha: "2026-02-30",
        contenido: "Contenido válido",
      }).success
    ).toBe(false);
  });
});

describe("rectificarClaseSchema", () => {
  it("exige motivo", () => {
    const base = {
      claseId: "c",
      asignaturaId: "a",
      fecha: "2026-04-10",
      contenido: "Corrección de contenidos",
    };
    expect(rectificarClaseSchema.safeParse(base).success).toBe(false);
    expect(
      rectificarClaseSchema.safeParse({ ...base, motivo: "Error de tipeo" })
        .success
    ).toBe(true);
  });
});
