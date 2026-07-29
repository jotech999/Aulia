import { describe, expect, it } from "vitest";
import {
  DESCUENTO_RED,
  PLANES,
  cotizar,
  descuentoEfectivo,
  formatearCLP,
  formatearUF,
  repartirEnTramos,
} from "./precios";

const plan = (id: string) => {
  const p = PLANES.find((x) => x.id === id);
  if (!p) throw new Error(`plan ${id} no existe`);
  return p;
};

describe("repartirEnTramos", () => {
  it("deja toda la matrícula en el primer tramo hasta 300", () => {
    expect(repartirEnTramos(300)).toEqual([
      { descuento: 0, alumnos: 300, etiqueta: "Estudiantes 1 a 300" },
    ]);
  });

  it("reparte de forma marginal al cruzar tramos", () => {
    const r = repartirEnTramos(600);
    expect(r.map((t) => t.alumnos)).toEqual([300, 300]);
    expect(r.map((t) => t.descuento)).toEqual([0, 0.08]);
  });

  it("cubre los cuatro tramos en un colegio grande", () => {
    const r = repartirEnTramos(1500);
    expect(r.map((t) => t.alumnos)).toEqual([300, 400, 500, 300]);
    expect(r.map((t) => t.descuento)).toEqual([0, 0.08, 0.15, 0.22]);
  });

  it("la suma del reparto siempre iguala la matrícula", () => {
    for (const m of [1, 299, 300, 301, 700, 701, 1200, 1201, 2500]) {
      expect(repartirEnTramos(m).reduce((s, t) => s + t.alumnos, 0)).toBe(m);
    }
  });

  it("no reparte nada con matrícula cero o negativa", () => {
    expect(repartirEnTramos(0)).toEqual([]);
    expect(repartirEnTramos(-5)).toEqual([]);
    expect(descuentoEfectivo(0)).toBe(0);
  });
});

describe("cotizar", () => {
  it("cobra por estudiante cuando la matrícula supera el mínimo del plan", () => {
    // 300 × 0,26 + 300 × 0,26 × 0,92 = 78 + 71,76 = 149,76 → 149,8 UF
    const c = cotizar(plan("pro"), 600);
    expect(c.ufAnual).toBe(149.8);
    expect(c.aplicaPiso).toBe(false);
  });

  it("aplica el mínimo del plan en establecimientos pequeños", () => {
    // 100 × 0,26 = 26 UF, bajo el piso de 40 UF del plan Pro
    const c = cotizar(plan("pro"), 100);
    expect(c.ufAnual).toBe(40);
    expect(c.aplicaPiso).toBe(true);
  });

  it("el precio total nunca baja al cruzar un borde de tramo", () => {
    for (const borde of [300, 700, 1200]) {
      expect(cotizar(plan("pro"), borde + 1).ufAnual).toBeGreaterThan(
        cotizar(plan("pro"), borde).ufAnual,
      );
    }
  });

  it("el precio crece de forma monótona con la matrícula", () => {
    let anterior = 0;
    for (let m = 200; m <= 2000; m += 50) {
      const actual = cotizar(plan("gestion"), m).ufAnual;
      expect(actual).toBeGreaterThanOrEqual(anterior);
      anterior = actual;
    }
  });

  it("el precio por estudiante baja al crecer el colegio (hay economía de escala)", () => {
    const unitario = (m: number) => cotizar(plan("pro"), m).ufAnual / m;
    expect(unitario(1500)).toBeLessThan(unitario(600));
    expect(unitario(600)).toBeLessThan(unitario(300));
  });

  it("aplica el descuento de red de sostenedor sobre el total y sobre el mínimo", () => {
    const solo = cotizar(plan("gestion"), 900);
    const red = cotizar(plan("gestion"), 900, { red: true });
    expect(red.ufAnual).toBeLessThan(solo.ufAnual);
    expect(red.ufAnual).toBeCloseTo(solo.ufAnual * (1 - DESCUENTO_RED), 0);

    // Con mínimo: 50 alumnos en Gestión (piso 55 UF) → 55 × 0,88 = 48,4
    const pequenoRed = cotizar(plan("gestion"), 50, { red: true });
    expect(pequenoRed.aplicaPiso).toBe(true);
    expect(pequenoRed.ufAnual).toBeCloseTo(55 * (1 - DESCUENTO_RED), 1);
  });

  it("ordena los planes de menor a mayor para una misma matrícula", () => {
    const m = 800;
    expect(cotizar(plan("libro"), m).ufAnual).toBeLessThan(cotizar(plan("pro"), m).ufAnual);
    expect(cotizar(plan("pro"), m).ufAnual).toBeLessThan(cotizar(plan("gestion"), m).ufAnual);
  });

  it("se mantiene dentro del rango público de Lirmi (USD 5 a 20 por estudiante al año)", () => {
    // Rango equivalente en UF a julio 2026: 0,11 a 0,45 UF por estudiante al año.
    for (const p of PLANES) {
      expect(p.ufPorEstudiante).toBeGreaterThanOrEqual(0.11);
      expect(p.ufPorEstudiante).toBeLessThanOrEqual(0.45);
    }
  });

  it("no rompe con matrícula cero ni negativa", () => {
    const cero = cotizar(plan("libro"), 0);
    expect(cero.ufAnual).toBe(25);
    expect(cero.clpPorEstudianteMes).toBe(0);
    expect(cotizar(plan("libro"), -10).ufAnual).toBe(25);
  });

  it("calcula el costo por estudiante al mes de forma coherente con el total", () => {
    const c = cotizar(plan("pro"), 600);
    expect(c.clpPorEstudianteMes).toBe(Math.round(c.clpAnual / 600 / 12));
  });
});

describe("formateo", () => {
  it("formatea pesos con separador de miles chileno", () => {
    expect(formatearCLP(5862000)).toBe("$5.862.000");
  });

  it("formatea UF con coma decimal", () => {
    expect(formatearUF(149.8)).toBe("149,8");
    expect(formatearUF(40)).toBe("40");
  });
});
