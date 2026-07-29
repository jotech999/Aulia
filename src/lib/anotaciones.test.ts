import { describe, it, expect } from "vitest";
import {
  autorizarCrearAnotacion,
  autorizarEliminarAnotacion,
  pareceDatoSensible,
  crearAnotacionSchema,
  eliminarAnotacionSchema,
} from "./anotaciones";

describe("autorizarCrearAnotacion", () => {
  it("permite a todo el staff", () => {
    for (const rol of ["ADMIN", "DIRECTOR", "UTP", "PROFESOR_JEFE", "PROFESOR", "INSPECTOR"]) {
      expect(autorizarCrearAnotacion(rol)).toBe(true);
    }
  });
  it("niega al apoderado", () => {
    expect(autorizarCrearAnotacion("APODERADO")).toBe(false);
  });
});

describe("autorizarEliminarAnotacion", () => {
  const an = { autorId: "prof-1" };
  it("permite a dirección/UTP/admin", () => {
    expect(autorizarEliminarAnotacion("DIRECTOR", "x", an)).toBe(true);
    expect(autorizarEliminarAnotacion("UTP", "x", an)).toBe(true);
  });
  it("permite al autor", () => {
    expect(autorizarEliminarAnotacion("PROFESOR", "prof-1", an)).toBe(true);
  });
  it("niega a otro profesor", () => {
    expect(autorizarEliminarAnotacion("PROFESOR", "otro", an)).toBe(false);
  });
});

describe("pareceDatoSensible (minimización Ley 21.719)", () => {
  it("detecta términos clínicos comunes", () => {
    expect(pareceDatoSensible("El estudiante tiene diagnóstico de TDAH")).toBe(true);
    expect(pareceDatoSensible("presenta déficit atencional")).toBe(true);
    expect(pareceDatoSensible("está medicado")).toBe(true);
  });
  it("no marca una anotación factual normal", () => {
    expect(pareceDatoSensible("No entregó la tarea de matemática")).toBe(false);
    expect(pareceDatoSensible("Ayudó a un compañero en el recreo")).toBe(false);
  });
});

describe("crearAnotacionSchema", () => {
  it("acepta una anotación válida", () => {
    expect(
      crearAnotacionSchema.safeParse({
        estudianteId: "s",
        tipo: "POSITIVA",
        texto: "Colaboró en la actividad grupal",
      }).success
    ).toBe(true);
  });
  it("rechaza tipo inválido o texto muy corto", () => {
    expect(
      crearAnotacionSchema.safeParse({
        estudianteId: "s",
        tipo: "MALA",
        texto: "Colaboró en la actividad",
      }).success
    ).toBe(false);
    expect(
      crearAnotacionSchema.safeParse({
        estudianteId: "s",
        tipo: "NEUTRA",
        texto: "x",
      }).success
    ).toBe(false);
  });
});

describe("eliminarAnotacionSchema", () => {
  it("exige motivo", () => {
    expect(
      eliminarAnotacionSchema.safeParse({ anotacionId: "a" }).success
    ).toBe(false);
    expect(
      eliminarAnotacionSchema.safeParse({
        anotacionId: "a",
        motivo: "Registrada por error",
      }).success
    ).toBe(true);
  });
});
