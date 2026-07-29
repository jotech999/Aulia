import { describe, it, expect } from "vitest";
import {
  asignaturaCanonica,
  autorizarPlanificacion,
  calcularCobertura,
  guardarPlanificacionSchema,
  type OaRef,
} from "./planificacion";

describe("asignaturaCanonica", () => {
  it("mapea variantes de nombre al canónico", () => {
    expect(asignaturaCanonica("Matemática")).toBe("Matemática");
    expect(asignaturaCanonica("MATEMATICAS")).toBe("Matemática");
    expect(asignaturaCanonica("Lenguaje y Comunicación")).toBe(
      "Lenguaje y Comunicación"
    );
    expect(asignaturaCanonica("Lengua y Literatura")).toBe(
      "Lenguaje y Comunicación"
    );
  });
  it("devuelve null para asignaturas sin OA cargados", () => {
    expect(asignaturaCanonica("Historia")).toBeNull();
    expect(asignaturaCanonica("Ciencias Naturales")).toBeNull();
  });
});

describe("autorizarPlanificacion", () => {
  const asig = { docenteId: "prof-1" };
  it("permite a UTP/Director/Admin", () => {
    expect(autorizarPlanificacion("UTP", "x", asig)).toBe(true);
    expect(autorizarPlanificacion("DIRECTOR", "x", asig)).toBe(true);
  });
  it("permite solo al docente de la asignatura", () => {
    expect(autorizarPlanificacion("PROFESOR", "prof-1", asig)).toBe(true);
    expect(autorizarPlanificacion("PROFESOR", "otro", asig)).toBe(false);
  });
  it("niega a inspector y apoderado", () => {
    expect(autorizarPlanificacion("INSPECTOR", "prof-1", asig)).toBe(false);
    expect(autorizarPlanificacion("APODERADO", "prof-1", asig)).toBe(false);
  });
});

describe("calcularCobertura", () => {
  const universo: OaRef[] = [
    { codigo: "MA05 OA 01", eje: "Números" },
    { codigo: "MA05 OA 02", eje: "Números" },
    { codigo: "MA05 OA 14", eje: "Álgebra" },
    { codigo: "MA05 OA 16", eje: "Geometría" },
  ];

  it("calcula porcentajes de planificado y tratado", () => {
    const plan = new Set(["MA05 OA 01", "MA05 OA 02", "MA05 OA 14"]);
    const trat = new Set(["MA05 OA 01"]);
    const r = calcularCobertura(universo, plan, trat);
    expect(r.total).toBe(4);
    expect(r.planificados).toBe(3);
    expect(r.tratados).toBe(1);
    expect(r.pctPlanificado).toBe(75);
    expect(r.pctTratado).toBe(25);
  });

  it("ignora códigos fuera del universo del nivel", () => {
    const plan = new Set(["MA05 OA 01", "MA06 OA 09"]); // el segundo es de otro nivel
    const r = calcularCobertura(universo, plan, new Set());
    expect(r.planificados).toBe(1);
  });

  it("desglosa por eje", () => {
    const r = calcularCobertura(
      universo,
      new Set(["MA05 OA 01", "MA05 OA 16"]),
      new Set(["MA05 OA 16"])
    );
    const numeros = r.porEje.find((e) => e.eje === "Números")!;
    const geo = r.porEje.find((e) => e.eje === "Geometría")!;
    expect(numeros.total).toBe(2);
    expect(numeros.planificados).toBe(1);
    expect(geo.tratados).toBe(1);
  });

  it("maneja universo vacío sin dividir por cero", () => {
    const r = calcularCobertura([], new Set(), new Set());
    expect(r.pctTratado).toBe(0);
    expect(r.total).toBe(0);
  });
});

describe("guardarPlanificacionSchema", () => {
  it("acepta una planificación válida con OA", () => {
    expect(
      guardarPlanificacionSchema.safeParse({
        asignaturaId: "a",
        tipo: "UNIDAD",
        titulo: "Unidad 1: Números",
        oaCodigos: ["MA05 OA 01", "MA05 OA 02"],
      }).success
    ).toBe(true);
  });
  it("rechaza tipo o código OA inválido", () => {
    expect(
      guardarPlanificacionSchema.safeParse({
        asignaturaId: "a",
        tipo: "SEMESTRAL",
        titulo: "Unidad 1",
      }).success
    ).toBe(false);
    expect(
      guardarPlanificacionSchema.safeParse({
        asignaturaId: "a",
        tipo: "CLASE",
        titulo: "Clase 1",
        oaCodigos: ["MA5-OA-1"],
      }).success
    ).toBe(false);
  });
});
