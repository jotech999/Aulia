import { describe, expect, it } from "vitest";
import {
  autorizarRubrica,
  calcularPuntajeRubrica,
  guardarAplicacionRubricaSchema,
  guardarRubricaSchema,
} from "./rubricas";

const asignatura = {
  docenteId: "profesor-1",
  curso: { profesorJefeId: "jefe-1" },
};

describe("autorizarRubrica", () => {
  it("permite a gestión, docente de asignatura y profesor jefe", () => {
    expect(autorizarRubrica("UTP", "otra", null)).toBe(true);
    expect(autorizarRubrica("PROFESOR", "profesor-1", asignatura)).toBe(true);
    expect(autorizarRubrica("PROFESOR_JEFE", "jefe-1", asignatura)).toBe(true);
  });

  it("niega a un docente ajeno y a roles sin atribución", () => {
    expect(autorizarRubrica("PROFESOR", "otro", asignatura)).toBe(false);
    expect(autorizarRubrica("APODERADO", "profesor-1", asignatura)).toBe(false);
    expect(autorizarRubrica("INSPECTOR", "jefe-1", asignatura)).toBe(false);
  });
});

describe("guardarRubricaSchema", () => {
  it("acepta una rúbrica profesional con criterios y niveles", () => {
    const resultado = guardarRubricaSchema.safeParse({
      asignaturaId: "asig-1",
      nombre: "Presentación oral",
      descripcion: "Instrumento de evaluación formativa.",
      tipo: "RUBRICA",
      oaCodigos: ["LE06 OA 28"],
      criterios: [
        {
          descripcion: "Organiza las ideas con claridad",
          peso: 2,
          niveles: [
            { etiqueta: "Logrado", descriptor: "Secuencia clara", puntaje: 3 },
            { etiqueta: "En proceso", descriptor: "Secuencia parcial", puntaje: 1 },
          ],
        },
      ],
    });
    expect(resultado.success).toBe(true);
  });

  it("exige dos opciones por criterio en una pauta de cotejo", () => {
    const resultado = guardarRubricaSchema.safeParse({
      asignaturaId: "asig-1",
      nombre: "Pauta de trabajo",
      tipo: "PAUTA_COTEJO",
      criterios: [
        {
          descripcion: "Entrega a tiempo",
          peso: 1,
          niveles: [
            { etiqueta: "Sí", descriptor: "Cumple", puntaje: 1 },
            { etiqueta: "Parcial", descriptor: "Cumple parcialmente", puntaje: 0.5 },
            { etiqueta: "No", descriptor: "No cumple", puntaje: 0 },
          ],
        },
      ],
    });
    expect(resultado.success).toBe(false);
  });
});

describe("aplicación de rúbrica", () => {
  it("calcula puntaje ponderado sin convertirlo a nota", () => {
    expect(
      calcularPuntajeRubrica(
        [
          { id: "c1", peso: 2, puntajeMax: 3 },
          { id: "c2", peso: 1, puntajeMax: 4 },
        ],
        [
          { criterioId: "c1", puntaje: 2 },
          { criterioId: "c2", puntaje: 4 },
        ]
      )
    ).toEqual({ total: 8, maximo: 10, porcentaje: 80 });
  });

  it("acepta un borrador parcial con retroalimentación", () => {
    expect(
      guardarAplicacionRubricaSchema.safeParse({
        rubricaId: "r1",
        evaluacionId: "e1",
        estudianteId: "s1",
        retroalimentacion: "Fortaleza: argumentación clara.",
        finalizar: false,
        selecciones: [{ criterioId: "c1", nivelId: "n1", comentario: "Bien" }],
      }).success
    ).toBe(true);
  });
});
