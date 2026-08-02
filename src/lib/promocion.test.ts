import { describe, expect, it } from "vitest";
import { evaluarPromocion } from "./promocion";

/**
 * Casos del Art. 10 del Decreto 67. Son reglas legales: si estos tests
 * cambian, debe cambiar primero la interpretación normativa, no el código.
 */

const asig = (nombre: string, promedio: number | null) => ({ nombre, promedio });

describe("evaluarPromocion — requisito de logro (Art. 10 a/b/c)", () => {
  it("promueve a quien aprueba todas las asignaturas con 85% de asistencia", () => {
    const r = evaluarPromocion({
      asignaturas: [asig("Lenguaje", 5.5), asig("Matemática", 4.2), asig("Historia", 6.0)],
      asistencia: 92,
    });
    expect(r.estado).toBe("PROMOVIDO");
    expect(r.reglaLogro).toBe("a");
    expect(r.asignaturasReprobadas).toEqual([]);
  });

  it("promueve con UNA reprobada si el promedio general llega a 4.5", () => {
    const r = evaluarPromocion({
      asignaturas: [asig("Lenguaje", 3.8), asig("Matemática", 5.0), asig("Historia", 5.0)],
      asistencia: 90,
    });
    expect(r.promedioGeneral).toBe(4.6);
    expect(r.cumpleLogro).toBe(true);
    expect(r.reglaLogro).toBe("b");
    expect(r.estado).toBe("PROMOVIDO");
  });

  it("manda a análisis con UNA reprobada si el promedio general no llega a 4.5", () => {
    const r = evaluarPromocion({
      asignaturas: [asig("Lenguaje", 3.0), asig("Matemática", 4.5), asig("Historia", 4.5)],
      asistencia: 95,
    });
    expect(r.cumpleLogro).toBe(false);
    expect(r.estado).toBe("ANALISIS");
  });

  it("promueve con DOS reprobadas si el promedio general llega a 5.0", () => {
    const r = evaluarPromocion({
      asignaturas: [
        asig("Lenguaje", 3.9),
        asig("Matemática", 3.9),
        asig("Historia", 6.6),
        asig("Ciencias", 6.6),
      ],
      asistencia: 88,
    });
    expect(r.promedioGeneral).toBe(5.3);
    expect(r.reglaLogro).toBe("c");
    expect(r.estado).toBe("PROMOVIDO");
  });

  it("propone REPITE con tres o más asignaturas reprobadas", () => {
    const r = evaluarPromocion({
      asignaturas: [
        asig("Lenguaje", 3.0),
        asig("Matemática", 3.2),
        asig("Historia", 3.5),
        asig("Ciencias", 6.0),
      ],
      asistencia: 95,
    });
    expect(r.estado).toBe("REPITE");
    expect(r.asignaturasReprobadas).toHaveLength(3);
  });
});

describe("evaluarPromocion — requisito de asistencia", () => {
  it("manda a análisis a quien aprueba todo pero no llega al 85%", () => {
    const r = evaluarPromocion({
      asignaturas: [asig("Lenguaje", 6.0), asig("Matemática", 6.0)],
      asistencia: 80,
    });
    expect(r.cumpleLogro).toBe(true);
    expect(r.cumpleAsistencia).toBe(false);
    expect(r.estado).toBe("ANALISIS");
    expect(r.motivos.join(" ")).toContain("director");
  });

  it("acepta exactamente 85% como suficiente", () => {
    const r = evaluarPromocion({
      asignaturas: [asig("Lenguaje", 4.0)],
      asistencia: 85,
    });
    expect(r.cumpleAsistencia).toBe(true);
    expect(r.estado).toBe("PROMOVIDO");
  });

  it("sin registro de asistencia queda en análisis, no promovido", () => {
    const r = evaluarPromocion({
      asignaturas: [asig("Lenguaje", 6.0)],
      asistencia: null,
    });
    expect(r.estado).toBe("ANALISIS");
  });
});

describe("evaluarPromocion — bordes", () => {
  it("sin calificaciones no afirma logro", () => {
    const r = evaluarPromocion({ asignaturas: [asig("Lenguaje", null)], asistencia: 95 });
    expect(r.cumpleLogro).toBe(false);
    expect(r.promedioGeneral).toBeNull();
    expect(r.estado).toBe("ANALISIS");
  });

  it("ignora asignaturas que no inciden en la promoción", () => {
    const r = evaluarPromocion({
      asignaturas: [
        asig("Lenguaje", 6.0),
        { nombre: "Religión", promedio: 2.0, incidePromocion: false },
      ],
      asistencia: 95,
    });
    expect(r.asignaturasReprobadas).toEqual([]);
    expect(r.promedioGeneral).toBe(6.0);
    expect(r.estado).toBe("PROMOVIDO");
  });

  it("aproxima el promedio general a la décima", () => {
    const r = evaluarPromocion({
      asignaturas: [asig("A", 5.0), asig("B", 5.1), asig("C", 5.1)],
      asistencia: 95,
    });
    expect(r.promedioGeneral).toBe(5.1);
  });
});
