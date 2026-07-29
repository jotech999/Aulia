import { describe, it, expect } from "vitest";
import { evaluarRiesgo, accionesSugeridas, type SenalesEstudiante } from "./riesgo";

const base: SenalesEstudiante = {
  porcentajeAsistencia: 100,
  diasConRegistro: 20,
  asignaturasReprobadas: 0,
  asignaturasConNota: 4,
  promedioGeneral: 6.0,
  anotacionesNegativas: 0,
};

describe("evaluarRiesgo", () => {
  it("sin señales → BAJO sin factores", () => {
    const r = evaluarRiesgo(base);
    expect(r.nivel).toBe("BAJO");
    expect(r.factores).toHaveLength(0);
  });

  it("SIN_DATOS cuando no hay insumos", () => {
    const r = evaluarRiesgo({
      porcentajeAsistencia: null,
      diasConRegistro: 0,
      asignaturasReprobadas: 0,
      asignaturasConNota: 0,
      promedioGeneral: null,
      anotacionesNegativas: 0,
    });
    expect(r.nivel).toBe("SIN_DATOS");
  });

  it("ignora asistencia con pocos días de registro", () => {
    const r = evaluarRiesgo({ ...base, porcentajeAsistencia: 50, diasConRegistro: 3 });
    expect(r.factores.find((f) => f.codigo === "ASISTENCIA")).toBeUndefined();
  });

  it("asistencia bajo umbral escala por profundidad", () => {
    expect(evaluarRiesgo({ ...base, porcentajeAsistencia: 84 }).factores[0].puntos).toBe(1);
    expect(evaluarRiesgo({ ...base, porcentajeAsistencia: 78 }).factores[0].puntos).toBe(2);
    expect(evaluarRiesgo({ ...base, porcentajeAsistencia: 60 }).factores[0].puntos).toBe(3);
  });

  it("combina reprobadas + promedio general reprobatorio", () => {
    const r = evaluarRiesgo({
      ...base,
      asignaturasReprobadas: 2,
      promedioGeneral: 3.8,
    });
    // 2 (reprobadas) + 1 (promedio) = 3 → MEDIO
    expect(r.puntaje).toBe(3);
    expect(r.nivel).toBe("MEDIO");
    expect(r.factores.map((f) => f.codigo)).toContain("NOTAS");
    expect(r.factores.map((f) => f.codigo)).toContain("PROMEDIO");
  });

  it("riesgo ALTO al acumular varios factores", () => {
    const r = evaluarRiesgo({
      porcentajeAsistencia: 65, // 3
      diasConRegistro: 30,
      asignaturasReprobadas: 3, // 3
      asignaturasConNota: 5,
      promedioGeneral: 3.5, // 1
      anotacionesNegativas: 6, // 2
    });
    expect(r.puntaje).toBe(9);
    expect(r.nivel).toBe("ALTO");
    expect(r.factores).toHaveLength(4);
  });

  it("anotaciones negativas solo pesan desde 3", () => {
    expect(
      evaluarRiesgo({ ...base, anotacionesNegativas: 2 }).factores
    ).toHaveLength(0);
    expect(
      evaluarRiesgo({ ...base, anotacionesNegativas: 3 }).factores[0].puntos
    ).toBe(1);
    expect(
      evaluarRiesgo({ ...base, anotacionesNegativas: 6 }).factores[0].puntos
    ).toBe(2);
  });
});

describe("accionesSugeridas", () => {
  it("sugiere citar apoderado ante baja asistencia", () => {
    const r = evaluarRiesgo({
      porcentajeAsistencia: 72,
      diasConRegistro: 20,
      asignaturasReprobadas: 0,
      asignaturasConNota: 5,
      promedioGeneral: 5.2,
      anotacionesNegativas: 0,
    });
    const acc = accionesSugeridas(r.factores);
    expect(acc.some((a) => /apoderado|asistencia/i.test(a))).toBe(true);
  });

  it("sugiere reforzamiento ante asignaturas reprobadas", () => {
    const r = evaluarRiesgo({
      porcentajeAsistencia: 95,
      diasConRegistro: 20,
      asignaturasReprobadas: 2,
      asignaturasConNota: 5,
      promedioGeneral: 4.5,
      anotacionesNegativas: 0,
    });
    expect(accionesSugeridas(r.factores).some((a) => /reforzamiento|nivelaci/i.test(a))).toBe(true);
  });

  it("sin factores no sugiere acciones", () => {
    expect(accionesSugeridas([])).toEqual([]);
  });
});
