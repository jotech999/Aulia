import { describe, it, expect } from "vitest";
import {
  formatCLP,
  estadoEfectivo,
  generarCuotasPlan,
  puedeGestionarFinanzas,
} from "./finanzas";

describe("formatCLP", () => {
  it("formatea con separador de miles chileno", () => {
    expect(formatCLP(350000)).toBe("$350.000");
    expect(formatCLP(0)).toBe("$0");
    expect(formatCLP(1000)).toBe("$1.000");
  });
  it("redondea decimales", () => {
    expect(formatCLP(1999.6)).toBe("$2.000");
  });
});

describe("puedeGestionarFinanzas", () => {
  it("solo ADMIN y DIRECTOR", () => {
    expect(puedeGestionarFinanzas("ADMIN")).toBe(true);
    expect(puedeGestionarFinanzas("DIRECTOR")).toBe(true);
    expect(puedeGestionarFinanzas("UTP")).toBe(false);
    expect(puedeGestionarFinanzas("PROFESOR")).toBe(false);
    expect(puedeGestionarFinanzas("APODERADO")).toBe(false);
  });
});

describe("estadoEfectivo", () => {
  it("PAGADA y ANULADA no cambian", () => {
    expect(estadoEfectivo("PAGADA", "2026-01-01", "2026-07-01")).toBe("PAGADA");
    expect(estadoEfectivo("ANULADA", "2026-01-01", "2026-07-01")).toBe("ANULADA");
  });
  it("PENDIENTE vencida pasa a VENCIDA", () => {
    expect(estadoEfectivo("PENDIENTE", "2026-06-05", "2026-07-01")).toBe("VENCIDA");
  });
  it("PENDIENTE al día sigue PENDIENTE", () => {
    expect(estadoEfectivo("PENDIENTE", "2026-08-05", "2026-07-01")).toBe("PENDIENTE");
    // mismo día no está vencida
    expect(estadoEfectivo("PENDIENTE", "2026-07-01", "2026-07-01")).toBe("PENDIENTE");
  });
});

describe("generarCuotasPlan", () => {
  it("crea matrícula (marzo 10) + N mensualidades (marzo.., día 5)", () => {
    const cuotas = generarCuotasPlan({ anio: 2026, matricula: 50000, arancelAnual: 1000000, cuotas: 10 });
    expect(cuotas).toHaveLength(11);
    expect(cuotas[0]).toEqual({ concepto: "MATRICULA", numero: 0, monto: 50000, vencimientoISO: "2026-03-10" });
    expect(cuotas[1]).toMatchObject({ concepto: "MENSUALIDAD", numero: 1, monto: 100000, vencimientoISO: "2026-03-05" });
    expect(cuotas[10]).toMatchObject({ numero: 10, vencimientoISO: "2026-12-05" });
  });

  it("sin matrícula no agrega esa cuota", () => {
    const cuotas = generarCuotasPlan({ anio: 2026, matricula: 0, arancelAnual: 900000, cuotas: 9 });
    expect(cuotas).toHaveLength(9);
    expect(cuotas.every((c) => c.concepto === "MENSUALIDAD")).toBe(true);
  });

  it("suma el resto de la división a la primera mensualidad", () => {
    const cuotas = generarCuotasPlan({ anio: 2026, matricula: 0, arancelAnual: 1000003, cuotas: 10 });
    expect(cuotas[0].monto).toBe(100003);
    expect(cuotas[1].monto).toBe(100000);
    // el total repartido coincide con el arancel
    const total = cuotas.reduce((a, c) => a + c.monto, 0);
    expect(total).toBe(1000003);
  });

  it("hace rollover de mes al año siguiente", () => {
    const cuotas = generarCuotasPlan({ anio: 2026, matricula: 0, arancelAnual: 1200000, cuotas: 12 });
    expect(cuotas[10]).toMatchObject({ numero: 11, vencimientoISO: "2027-01-05" });
    expect(cuotas[11]).toMatchObject({ numero: 12, vencimientoISO: "2027-02-05" });
  });
});
