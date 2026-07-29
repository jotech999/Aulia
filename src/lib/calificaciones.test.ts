import { describe, it, expect } from "vitest";
import {
  esNotaValida,
  esReprobatoria,
  aproximarDecima,
  calcularPromedio,
  promedioGeneral,
  situacionPromocionPorNota,
  esNivelPrebasica,
  autorizarRegistroNotas,
  guardarCalificacionSchema,
  guardarEvaluacionSchema,
  puntajeANota,
} from "./calificaciones";

describe("puntajeANota (escala con exigencia 60%)", () => {
  it("puntaje máximo = 7.0 y cero = 1.0", () => {
    expect(puntajeANota(20, 20)).toBe(7.0);
    expect(puntajeANota(0, 20)).toBe(1.0);
  });
  it("en la exigencia (60%) da 4.0", () => {
    expect(puntajeANota(12, 20)).toBe(4.0); // 60% de 20
  });
  it("bajo la exigencia reprueba, sobre la exigencia aprueba", () => {
    expect(puntajeANota(10, 20)).toBeLessThan(4.0);
    expect(puntajeANota(16, 20)).toBeGreaterThan(4.0);
  });
  it("acota fuera de rango y evita división por cero", () => {
    expect(puntajeANota(30, 20)).toBe(7.0);
    expect(puntajeANota(5, 0)).toBe(1.0);
  });
});

describe("esNotaValida", () => {
  it("acepta notas 1.0–7.0 con un decimal", () => {
    for (const n of [1.0, 4.0, 5.5, 7.0, 6.9, 2.3]) {
      expect(esNotaValida(n)).toBe(true);
    }
  });
  it("rechaza fuera de rango", () => {
    expect(esNotaValida(0.9)).toBe(false);
    expect(esNotaValida(7.1)).toBe(false);
    expect(esNotaValida(-3)).toBe(false);
  });
  it("rechaza más de un decimal", () => {
    expect(esNotaValida(5.55)).toBe(false);
    expect(esNotaValida(4.25)).toBe(false);
  });
  it("rechaza no finitos", () => {
    expect(esNotaValida(NaN)).toBe(false);
    expect(esNotaValida(Infinity)).toBe(false);
  });
});

describe("esReprobatoria", () => {
  it("marca bajo 4.0 como reprobatoria", () => {
    expect(esReprobatoria(3.9)).toBe(true);
    expect(esReprobatoria(4.0)).toBe(false);
    expect(esReprobatoria(1.0)).toBe(true);
  });
});

describe("aproximarDecima (0.05 sube)", () => {
  it("aproxima según Decreto 67", () => {
    expect(aproximarDecima(6.45)).toBe(6.5);
    expect(aproximarDecima(6.44)).toBe(6.4);
    expect(aproximarDecima(5.95)).toBe(6.0);
    expect(aproximarDecima(3.94)).toBe(3.9);
    expect(aproximarDecima(3.95)).toBe(4.0); // justo cruza la aprobación
  });
  it("es estable con notas ya redondeadas", () => {
    expect(aproximarDecima(7.0)).toBe(7.0);
    expect(aproximarDecima(4.0)).toBe(4.0);
  });
});

describe("calcularPromedio", () => {
  it("pondera con denominador = Σ ponderación", () => {
    const r = calcularPromedio([
      { nota: 6.0, ponderacion: 30, computa: true },
      { nota: 5.0, ponderacion: 70, computa: true },
    ]);
    // (6*30 + 5*70) / 100 = 5.3
    expect(r.promedio).toBe(5.3);
    expect(r.computadas).toBe(2);
    expect(r.reprobatorio).toBe(false);
  });

  it("no asume que las ponderaciones sumen 100", () => {
    // pesos relativos 1 y 3
    const r = calcularPromedio([
      { nota: 7.0, ponderacion: 1, computa: true },
      { nota: 3.0, ponderacion: 3, computa: true },
    ]);
    // (7 + 9) / 4 = 4.0
    expect(r.promedio).toBe(4.0);
  });

  it("excluye pendientes (nota null), eximidas y formativas", () => {
    const r = calcularPromedio([
      { nota: 4.0, ponderacion: 1, computa: true },
      { nota: null, ponderacion: 1, computa: true }, // pendiente
      { nota: 7.0, ponderacion: 1, computa: false }, // formativa/eximida
    ]);
    expect(r.promedio).toBe(4.0);
    expect(r.computadas).toBe(1);
  });

  it("devuelve null si no hay notas que computen", () => {
    const r = calcularPromedio([
      { nota: null, ponderacion: 1, computa: true },
      { nota: 5.0, ponderacion: 1, computa: false },
    ]);
    expect(r.promedio).toBeNull();
    expect(r.reprobatorio).toBe(false);
  });

  it("ignora ponderaciones no positivas", () => {
    const r = calcularPromedio([
      { nota: 6.0, ponderacion: 0, computa: true },
      { nota: 4.0, ponderacion: 2, computa: true },
    ]);
    expect(r.promedio).toBe(4.0);
    expect(r.computadas).toBe(1);
  });

  it("marca reprobatorio bajo 4.0", () => {
    const r = calcularPromedio([{ nota: 3.5, ponderacion: 1, computa: true }]);
    expect(r.reprobatorio).toBe(true);
  });
});

describe("promedioGeneral y promoción", () => {
  it("promedia asignaturas y aproxima", () => {
    expect(promedioGeneral([6.0, 5.0, 5.0])).toBe(5.3);
    expect(promedioGeneral([])).toBeNull();
  });

  it("promueve sin reprobadas", () => {
    const s = situacionPromocionPorNota([6.0, 5.5, 4.5]);
    expect(s.reprobadas).toBe(0);
    expect(s.promuevePorNota).toBe(true);
  });

  it("una reprobada: promueve solo si general ≥ 4.5", () => {
    // finales 3.0 y 6.0 → general 4.5 → promueve
    expect(situacionPromocionPorNota([3.0, 6.0]).promuevePorNota).toBe(true);
    // finales 3.0 y 5.0 → general 4.0 → no promueve
    expect(situacionPromocionPorNota([3.0, 5.0]).promuevePorNota).toBe(false);
  });

  it("dos reprobadas: promueve solo si general ≥ 5.0", () => {
    // 3.0, 3.0, 7.0, 7.0 → general 5.0 → promueve
    expect(situacionPromocionPorNota([3.0, 3.0, 7.0, 7.0]).promuevePorNota).toBe(
      true
    );
    // 3.0, 3.0, 6.0, 6.0 → general 4.5 → no
    expect(situacionPromocionPorNota([3.0, 3.0, 6.0, 6.0]).promuevePorNota).toBe(
      false
    );
  });
});

describe("esNivelPrebasica", () => {
  it("identifica NT1/NT2", () => {
    expect(esNivelPrebasica("NT1")).toBe(true);
    expect(esNivelPrebasica("NT2")).toBe(true);
    expect(esNivelPrebasica("1B")).toBe(false);
    expect(esNivelPrebasica("4M")).toBe(false);
  });
});

describe("autorizarRegistroNotas", () => {
  const asig = { docenteId: "prof-1" };
  it("permite a UTP/Director/Admin del colegio", () => {
    expect(autorizarRegistroNotas("UTP", "x", asig)).toBe(true);
    expect(autorizarRegistroNotas("DIRECTOR", "x", asig)).toBe(true);
    expect(autorizarRegistroNotas("ADMIN", "x", asig)).toBe(true);
  });
  it("permite solo al docente de la asignatura", () => {
    expect(autorizarRegistroNotas("PROFESOR", "prof-1", asig)).toBe(true);
    expect(autorizarRegistroNotas("PROFESOR", "otro", asig)).toBe(false);
    expect(autorizarRegistroNotas("PROFESOR_JEFE", "prof-1", asig)).toBe(true);
  });
  it("niega a inspector y apoderado", () => {
    expect(autorizarRegistroNotas("INSPECTOR", "prof-1", asig)).toBe(false);
    expect(autorizarRegistroNotas("APODERADO", "prof-1", asig)).toBe(false);
  });
});

describe("schemas de entrada", () => {
  it("guardarCalificacion acepta nota válida, null y eximida", () => {
    expect(
      guardarCalificacionSchema.safeParse({
        evaluacionId: "e",
        estudianteId: "s",
        nota: 5.5,
      }).success
    ).toBe(true);
    expect(
      guardarCalificacionSchema.safeParse({
        evaluacionId: "e",
        estudianteId: "s",
        nota: null,
      }).success
    ).toBe(true);
    expect(
      guardarCalificacionSchema.safeParse({
        evaluacionId: "e",
        estudianteId: "s",
        eximida: true,
      }).success
    ).toBe(true);
  });
  it("guardarCalificacion rechaza nota fuera de escala", () => {
    expect(
      guardarCalificacionSchema.safeParse({
        evaluacionId: "e",
        estudianteId: "s",
        nota: 8,
      }).success
    ).toBe(false);
    expect(
      guardarCalificacionSchema.safeParse({
        evaluacionId: "e",
        estudianteId: "s",
        nota: 5.55,
      }).success
    ).toBe(false);
  });
  it("guardarEvaluacion exige ponderación positiva y nombre", () => {
    expect(
      guardarEvaluacionSchema.safeParse({
        asignaturaId: "a",
        nombre: "Prueba 1",
        ponderacion: 30,
        fecha: "2026-04-10",
      }).success
    ).toBe(true);
    expect(
      guardarEvaluacionSchema.safeParse({
        asignaturaId: "a",
        nombre: "Prueba 1",
        ponderacion: 0,
        fecha: "2026-04-10",
      }).success
    ).toBe(false);
    expect(
      guardarEvaluacionSchema.safeParse({
        asignaturaId: "a",
        nombre: "",
        ponderacion: 30,
        fecha: "2026-04-10",
      }).success
    ).toBe(false);
  });
});
