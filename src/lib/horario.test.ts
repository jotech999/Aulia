import { describe, it, expect } from "vitest";
import { construirHorario, type BloqueVista } from "./horario";

const b = (
  dia: number,
  horaInicio: string,
  horaFin: string,
  asignatura: string
): BloqueVista => ({ dia, horaInicio, horaFin, asignaturaId: `a-${asignatura}`, asignatura, color: null });

describe("construirHorario", () => {
  it("agrupa por hora de inicio y ubica cada bloque en su día", () => {
    const filas = construirHorario([
      b(1, "08:00", "08:45", "Lenguaje"),
      b(3, "08:00", "08:45", "Matemática"),
      b(1, "09:00", "09:45", "Historia"),
    ]);

    expect(filas).toHaveLength(2); // dos franjas: 08:00 y 09:00
    expect(filas[0].horaInicio).toBe("08:00");
    expect(filas[0].celdas[0]?.asignatura).toBe("Lenguaje"); // lunes
    expect(filas[0].celdas[1]).toBeNull(); // martes libre
    expect(filas[0].celdas[2]?.asignatura).toBe("Matemática"); // miércoles
    expect(filas[1].horaInicio).toBe("09:00");
    expect(filas[1].celdas[0]?.asignatura).toBe("Historia");
  });

  it("ordena las franjas por hora ascendente", () => {
    const filas = construirHorario([
      b(2, "10:15", "11:00", "Arte"),
      b(2, "08:00", "08:45", "Lenguaje"),
      b(2, "09:00", "09:45", "Ciencias"),
    ]);
    expect(filas.map((f) => f.horaInicio)).toEqual(["08:00", "09:00", "10:15"]);
  });

  it("cada fila tiene exactamente 5 celdas (lunes a viernes)", () => {
    const filas = construirHorario([b(5, "08:00", "08:45", "Ed. Física")]);
    expect(filas[0].celdas).toHaveLength(5);
    expect(filas[0].celdas[4]?.asignatura).toBe("Ed. Física"); // viernes
    expect(filas[0].celdas[0]).toBeNull(); // lunes libre
  });

  it("sin bloques devuelve una grilla vacía", () => {
    expect(construirHorario([])).toEqual([]);
  });
});
