import { describe, expect, it } from "vitest";
import { digitoVerificador, formatearRut, normalizarRut, validarRut } from "./rut";

describe("digitoVerificador", () => {
  it("calcula DV conocidos", () => {
    expect(digitoVerificador(11111111)).toBe("1");
    expect(digitoVerificador(12345678)).toBe("5");
    expect(digitoVerificador(7775777)).toBe("5");
  });
});

describe("normalizarRut", () => {
  it("normaliza formatos con puntos y espacios", () => {
    expect(normalizarRut("12.345.678-5")).toBe("12345678-5");
    expect(normalizarRut(" 12345678-5 ")).toBe("12345678-5");
    expect(normalizarRut("9765432k")).toBe("9765432-K");
  });
  it("rechaza basura", () => {
    expect(normalizarRut("abc")).toBeNull();
    expect(normalizarRut("123")).toBeNull();
    expect(normalizarRut("")).toBeNull();
  });
});

describe("validarRut", () => {
  it("acepta RUT con DV correcto", () => {
    expect(validarRut("12.345.678-5")).toBe(true);
    expect(validarRut("11111111-1")).toBe(true);
  });
  it("rechaza DV incorrecto", () => {
    expect(validarRut("12.345.678-9")).toBe(false);
    expect(validarRut("11111111-2")).toBe(false);
  });
});

describe("formatearRut", () => {
  it("agrega puntos", () => {
    expect(formatearRut("12345678-5")).toBe("12.345.678-5");
  });
});
