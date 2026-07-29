import { describe, expect, it } from "vitest";
import {
  calcularClasesMensuales,
  generarCronograma,
} from "./calendario-planificacion";

describe("calcularClasesMensuales", () => {
  it("cuenta bloques vigentes y excluye feriados y suspensiones", () => {
    const resultado = calcularClasesMensuales({
      anio: 2026,
      versiones: [
        {
          numero: 1,
          vigenteDesde: "2026-03-01",
          vigenteHasta: null,
          bloques: [{ dia: 1 }, { dia: 3 }],
        },
      ],
      suspensiones: ["2026-04-01"],
      feriados: { "2026-04-03": "Viernes Santo" },
    });

    // Abril 2026 tiene cuatro lunes y cinco miércoles; se suspende un miércoles.
    expect(resultado[4]).toBe(8);
  });

  it("usa la versión publicada más reciente cuando las vigencias se solapan", () => {
    const resultado = calcularClasesMensuales({
      anio: 2026,
      versiones: [
        {
          numero: 1,
          vigenteDesde: "2026-03-01",
          vigenteHasta: null,
          bloques: [{ dia: 1 }],
        },
        {
          numero: 2,
          vigenteDesde: "2026-03-16",
          vigenteHasta: null,
          bloques: [{ dia: 2 }, { dia: 4 }],
        },
      ],
      suspensiones: [],
      feriados: {},
    });

    // Dos lunes antes del cambio; luego tres martes y dos jueves.
    expect(resultado[3]).toBe(7);
  });
});

describe("generarCronograma", () => {
  const versiones = [
    {
      numero: 1,
      vigenteDesde: "2026-03-01",
      vigenteHasta: null,
      bloques: [{ dia: 1 }, { dia: 3 }], // lunes y miércoles
    },
  ];

  it("reparte las clases en días hábiles del horario saltando feriados", () => {
    const cronograma = generarCronograma({
      anio: 2026,
      desde: "2026-03-02", // lunes
      cantidad: 4,
      versiones,
      suspensiones: [],
      feriados: {},
    });

    expect(cronograma.map((c) => c.fecha)).toEqual([
      "2026-03-02", // lun
      "2026-03-04", // mié
      "2026-03-09", // lun
      "2026-03-11", // mié
    ]);
    expect(cronograma.map((c) => c.orden)).toEqual([1, 2, 3, 4]);
  });

  it("saltea feriados y suspensiones al asignar fechas", () => {
    const cronograma = generarCronograma({
      anio: 2026,
      desde: "2026-03-02",
      cantidad: 3,
      versiones,
      suspensiones: ["2026-03-04"], // suspende ese miércoles
      feriados: { "2026-03-09": "Feriado ficticio" },
    });

    expect(cronograma.map((c) => c.fecha)).toEqual([
      "2026-03-02",
      "2026-03-11",
      "2026-03-16",
    ]);
  });

  it("asigna dos clases al mismo día cuando hay dos módulos", () => {
    const cronograma = generarCronograma({
      anio: 2026,
      desde: "2026-03-02",
      cantidad: 3,
      versiones: [
        {
          numero: 1,
          vigenteDesde: "2026-03-01",
          vigenteHasta: null,
          bloques: [{ dia: 1 }, { dia: 1 }], // dos módulos el lunes
        },
      ],
      suspensiones: [],
      feriados: {},
    });

    expect(cronograma.map((c) => c.fecha)).toEqual([
      "2026-03-02",
      "2026-03-02",
      "2026-03-09",
    ]);
  });

  it("no genera nada si la cantidad es cero o negativa", () => {
    expect(
      generarCronograma({
        anio: 2026,
        desde: "2026-03-02",
        cantidad: 0,
        versiones,
        suspensiones: [],
        feriados: {},
      })
    ).toEqual([]);
  });
});

