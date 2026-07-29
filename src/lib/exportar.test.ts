import { describe, it, expect } from "vitest";
import { construirCsv, nombreSeguro } from "./exportar";

const BOM = "﻿";

describe("construirCsv", () => {
  it("usa BOM UTF-8, separador ; y fin de línea CRLF", () => {
    expect(construirCsv(["a", "b"], [["1", "2"]])).toBe(`${BOM}a;b\r\n1;2\r\n`);
  });

  it("escapa celdas con separador, comillas o saltos de línea", () => {
    expect(construirCsv(["x"], [["a;b"]])).toBe(`${BOM}x\r\n"a;b"\r\n`);
    expect(construirCsv(["x"], [['dijo "hola"']])).toBe(`${BOM}x\r\n"dijo ""hola"""\r\n`);
    expect(construirCsv(["x"], [["línea1\nlínea2"]])).toBe(`${BOM}x\r\n"línea1\nlínea2"\r\n`);
  });

  it("protege contra inyección de fórmulas (CSV injection)", () => {
    // Un texto que empieza con = + - @ se antepone con apóstrofo (texto literal).
    expect(construirCsv(["x"], [["=SUM(A1:A9)"]])).toBe(`${BOM}x\r\n'=SUM(A1:A9)\r\n`);
    expect(construirCsv(["x"], [["+1"]])).toBe(`${BOM}x\r\n'+1\r\n`);
    expect(construirCsv(["x"], [["@cmd"]])).toBe(`${BOM}x\r\n'@cmd\r\n`);
  });

  it("los números quedan intactos y null/undefined son celda vacía", () => {
    expect(construirCsv(["n"], [[100, null, undefined]])).toBe(`${BOM}n\r\n100;;\r\n`);
  });
});

describe("nombreSeguro", () => {
  it("quita acentos y reemplaza caracteres problemáticos por _", () => {
    expect(nombreSeguro("Acta 1° Básico A")).toBe("Acta_1_Basico_A");
  });

  it("colapsa y recorta guiones bajos de los extremos", () => {
    expect(nombreSeguro("  áéí  ")).toBe("aei");
    expect(nombreSeguro("a///b")).toBe("a_b");
  });

  it("conserva guiones y guiones bajos válidos", () => {
    expect(nombreSeguro("reporte-2026_final")).toBe("reporte-2026_final");
  });
});
