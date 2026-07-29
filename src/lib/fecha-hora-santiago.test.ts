import { describe, expect, it } from "vitest";
import { fechaHoraLocalSantiago, fechaHoraSantiagoDesdeLocal } from "./fecha-hora-santiago";

describe("fecha y hora America/Santiago", () => {
  it("interpreta datetime-local con el offset de invierno", () => {
    expect(fechaHoraSantiagoDesdeLocal("2026-07-21T09:30")?.toISOString()).toBe("2026-07-21T13:30:00.000Z");
  });

  it("interpreta datetime-local con el offset de verano", () => {
    expect(fechaHoraSantiagoDesdeLocal("2026-01-21T09:30")?.toISOString()).toBe("2026-01-21T12:30:00.000Z");
  });

  it("formatea siempre en Santiago y rechaza formatos ambiguos", () => {
    expect(fechaHoraLocalSantiago(new Date("2026-07-21T13:30:00.000Z"))).toBe("2026-07-21T09:30");
    expect(fechaHoraSantiagoDesdeLocal("2026-07-21 09:30")).toBeNull();
  });
});
