import { describe, it, expect } from "vitest";
import { construirMes, mesVecino } from "./calendario";

describe("construirMes", () => {
  it("julio 2026 empieza en miércoles: la 1ª semana trae 2 días de junio", () => {
    const semanas = construirMes("2026-07");
    const primera = semanas[0];
    expect(primera).toHaveLength(7);
    // Lunes y martes son del 29 y 30 de junio (fuera del mes).
    expect(primera[0]).toMatchObject({ iso: "2026-06-29", delMes: false });
    expect(primera[1]).toMatchObject({ iso: "2026-06-30", delMes: false });
    expect(primera[2]).toMatchObject({ iso: "2026-07-01", dia: 1, delMes: true });
  });

  it("todas las semanas tienen 7 días", () => {
    for (const semana of construirMes("2026-07")) {
      expect(semana).toHaveLength(7);
    }
  });

  it("incluye todos los días del mes marcados como delMes", () => {
    const delMes = construirMes("2026-07")
      .flat()
      .filter((c) => c.delMes);
    expect(delMes).toHaveLength(31);
    expect(delMes.at(-1)?.iso).toBe("2026-07-31");
  });

  it("febrero 2026 (empieza domingo) se arma sin días perdidos", () => {
    const delMes = construirMes("2026-02")
      .flat()
      .filter((c) => c.delMes);
    expect(delMes).toHaveLength(28);
  });
});

describe("mesVecino", () => {
  it("navega al mes anterior y siguiente", () => {
    expect(mesVecino("2026-07", -1)).toBe("2026-06");
    expect(mesVecino("2026-07", 1)).toBe("2026-08");
  });

  it("cruza el cambio de año", () => {
    expect(mesVecino("2026-01", -1)).toBe("2025-12");
    expect(mesVecino("2026-12", 1)).toBe("2027-01");
  });
});
