import { describe, expect, it } from "vitest";
import {
  esFechaFutura,
  esFechaISOValida,
  fechaDesdeISO,
  fechaISOenSantiago,
  isoDesdeFecha,
  rangoMes,
  semestreEscolar,
} from "./fecha";

describe("fechaISOenSantiago", () => {
  it("usa el día calendario chileno, no el UTC (invierno, UTC-4)", () => {
    // 03:30 UTC de un 8-jul es 23:30 del 7-jul en Santiago (UTC-4).
    expect(fechaISOenSantiago(new Date("2026-07-08T03:30:00Z"))).toBe(
      "2026-07-07"
    );
  });

  it("respeta el horario de verano chileno (UTC-3)", () => {
    // 02:00 UTC de un 1-ene es 23:00 del 31-dic en Santiago (UTC-3).
    expect(fechaISOenSantiago(new Date("2026-01-01T02:00:00Z"))).toBe(
      "2025-12-31"
    );
  });
});

describe("esFechaFutura", () => {
  it("compara fechas ISO lexicográficamente", () => {
    expect(esFechaFutura("2026-07-09", "2026-07-08")).toBe(true);
    expect(esFechaFutura("2026-07-08", "2026-07-08")).toBe(false);
    expect(esFechaFutura("2026-07-07", "2026-07-08")).toBe(false);
  });
});

describe("esFechaISOValida", () => {
  it("acepta formato correcto y rechaza el resto", () => {
    expect(esFechaISOValida("2026-07-08")).toBe(true);
    expect(esFechaISOValida("2026-7-8")).toBe(false);
    expect(esFechaISOValida("08-07-2026")).toBe(false);
    expect(esFechaISOValida("")).toBe(false);
  });

  it("rechaza días que no existen (no hace rollover silencioso)", () => {
    expect(esFechaISOValida("2026-02-30")).toBe(false); // febrero no tiene 30
    expect(esFechaISOValida("2026-04-31")).toBe(false); // abril no tiene 31
    expect(esFechaISOValida("2026-13-01")).toBe(false); // no hay mes 13
    expect(esFechaISOValida("2026-00-10")).toBe(false); // no hay mes 0
    expect(esFechaISOValida("2024-02-29")).toBe(true); // 2024 sí es bisiesto
  });
});

describe("fechaDesdeISO / isoDesdeFecha", () => {
  it("ida y vuelta sin desfase de día", () => {
    const d = fechaDesdeISO("2026-07-08");
    expect(d.toISOString()).toBe("2026-07-08T00:00:00.000Z");
    expect(isoDesdeFecha(d)).toBe("2026-07-08");
  });
});

describe("rangoMes", () => {
  it("cubre todos los días del mes y marca fines de semana", () => {
    const { inicio, fin, dias } = rangoMes("2026-07");
    expect(inicio.toISOString()).toBe("2026-07-01T00:00:00.000Z");
    expect(fin.toISOString()).toBe("2026-07-31T00:00:00.000Z");
    expect(dias).toHaveLength(31);
    // 4 de julio de 2026 es sábado.
    expect(dias.find((d) => d.dia === 4)?.finDeSemana).toBe(true);
    // 6 de julio de 2026 es lunes.
    expect(dias.find((d) => d.dia === 6)?.finDeSemana).toBe(false);
  });

  it("febrero de un año no bisiesto tiene 28 días", () => {
    expect(rangoMes("2026-02").dias).toHaveLength(28);
  });

  it("rechaza un mes con formato inválido", () => {
    expect(() => rangoMes("2026-13-01")).toThrow();
  });
});

describe("semestreEscolar", () => {
  it("marzo a julio es 1er semestre", () => {
    expect(semestreEscolar("2026-03")).toBe(1);
    expect(semestreEscolar("2026-07")).toBe(1);
  });

  it("agosto a diciembre es 2º semestre", () => {
    expect(semestreEscolar("2026-08")).toBe(2);
    expect(semestreEscolar("2026-12")).toBe(2);
  });

  it("enero/febrero (receso) se consideran 2º semestre", () => {
    expect(semestreEscolar("2026-01")).toBe(2);
    expect(semestreEscolar("2026-02")).toBe(2);
  });
});
