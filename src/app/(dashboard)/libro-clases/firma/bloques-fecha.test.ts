import { describe, expect, it } from "vitest";
import { bloquesParaFecha, type BloqueLeccionario } from "./bloques-fecha";

const bloques: BloqueLeccionario[] = [
  {
    id: "v1-martes",
    dia: 2,
    horaInicio: "08:00",
    horaFin: "08:45",
    versionNumero: 1,
    vigenteDesde: "2026-03-01",
    vigenteHasta: "2026-06-30",
  },
  {
    id: "v2-martes",
    dia: 2,
    horaInicio: "09:00",
    horaFin: "09:45",
    versionNumero: 2,
    vigenteDesde: "2026-07-01",
    vigenteHasta: null,
  },
];

describe("bloquesParaFecha", () => {
  it("conserva el bloque histórico que regía en la fecha elegida", () => {
    expect(bloquesParaFecha(bloques, "2026-06-23").map((b) => b.id)).toEqual([
      "v1-martes",
    ]);
  });

  it("usa la versión nueva después del cambio de vigencia", () => {
    expect(bloquesParaFecha(bloques, "2026-07-21").map((b) => b.id)).toEqual([
      "v2-martes",
    ]);
  });

  it("no ofrece bloques de otro día de la semana", () => {
    expect(bloquesParaFecha(bloques, "2026-07-22")).toEqual([]);
  });
});

