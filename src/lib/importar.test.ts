import { describe, it, expect } from "vitest";
import {
  parsearCsv,
  filasComoObjetos,
  validarEstudiantes,
  validarCursos,
  resumen,
} from "./importar";

describe("parsearCsv", () => {
  it("quita BOM, detecta separador ';' y respeta comillas con separador dentro", () => {
    const csv = '﻿a;b;c\r\n1;"x;y";3\r\n';
    expect(parsearCsv(csv)).toEqual([
      ["a", "b", "c"],
      ["1", "x;y", "3"],
    ]);
  });

  it("soporta separador coma cuando predomina", () => {
    expect(parsearCsv("a,b\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("ignora filas totalmente vacías", () => {
    expect(parsearCsv("a;b\n\n1;2\n;")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

const rutValido = "11111111-1"; // DV correcto
const rutValido2 = "12345678-5";

describe("validarEstudiantes", () => {
  const cols = "rut;nombres;apellidos;fecha_nacimiento;nivel;letra";

  function preparar(lineas: string[], ruts = new Set<string>(), cursos = new Set(["5BA"])) {
    const { registros } = filasComoObjetos(parsearCsv([cols, ...lineas].join("\n")));
    return validarEstudiantes(registros, ruts, cursos);
  }

  it("acepta una fila válida y la normaliza (caso feliz)", () => {
    const [f] = preparar([`${rutValido};Ana;Pérez;2015-03-21;5B;A`]);
    expect(f.errores).toEqual([]);
    expect(f.datos).toEqual({
      rut: rutValido,
      nombres: "Ana",
      apellidos: "Pérez",
      fechaNacimiento: "2015-03-21",
      cursoClave: "5BA",
    });
  });

  it("acepta fila sin curso (matrícula opcional)", () => {
    const [f] = preparar([`${rutValido};Ana;Pérez;;;`]);
    expect(f.errores).toEqual([]);
    expect(f.datos?.cursoClave).toBeNull();
  });

  it("exige nivel Y letra juntos para matricular", () => {
    const [f] = preparar([`${rutValido};Ana;Pérez;;5B;`]);
    expect(f.datos).toBeNull();
    expect(f.errores.some((e) => /nivel Y letra/i.test(e))).toBe(true);
  });

  it("rechaza RUT con dígito verificador inválido y no entrega datos", () => {
    const [f] = preparar(["12345678-9;Ana;Pérez;;;"]);
    expect(f.datos).toBeNull();
    expect(f.errores.some((e) => /RUT inválido/i.test(e))).toBe(true);
  });

  it("marca curso inexistente en el colegio", () => {
    const [f] = preparar([`${rutValido};Ana;Pérez;;9;Z`]);
    expect(f.datos).toBeNull();
    expect(f.errores.some((e) => /no existe/i.test(e))).toBe(true);
  });

  it("detecta duplicado dentro del archivo y contra la BD", () => {
    const filas = preparar(
      [`${rutValido};Ana;Pérez;;5B;A`, `${rutValido};Ana;Pérez;;5B;A`],
      new Set([rutValido2])
    );
    expect(filas[1].errores.some((e) => /duplicado dentro del archivo/i.test(e))).toBe(true);

    const [existente] = preparar([`${rutValido2};Ana;Pérez;;5B;A`], new Set([rutValido2]));
    expect(existente.errores.some((e) => /ya existe/i.test(e))).toBe(true);
  });

  it("rechaza fechas de calendario inválidas que JS normaliza (2015-02-30)", () => {
    const [f] = preparar([`${rutValido};Ana;Pérez;2015-02-30;;`]);
    expect(f.datos).toBeNull();
    expect(f.errores.some((e) => /fecha/i.test(e))).toBe(true);
  });

  it("exige nombres y apellidos", () => {
    const [f] = preparar([`${rutValido};;;;;`]);
    expect(f.datos).toBeNull();
    expect(f.errores).toEqual(expect.arrayContaining([expect.stringMatching(/nombres/i), expect.stringMatching(/apellidos/i)]));
  });
});

describe("validarCursos", () => {
  const cols = "nivel;letra";
  function preparar(lineas: string[], existentes = new Set<string>()) {
    const { registros } = filasComoObjetos(parsearCsv([cols, ...lineas].join("\n")));
    return validarCursos(registros, existentes);
  }

  it("acepta un curso válido (caso feliz) y normaliza el nivel", () => {
    const [f] = preparar(["5b;A"]);
    expect(f.errores).toEqual([]);
    expect(f.datos).toEqual({ nivel: "5B", letra: "A", clave: "5BA" });
  });

  it("rechaza nivel no válido", () => {
    const [f] = preparar(["13B;A"]);
    expect(f.datos).toBeNull();
    expect(f.errores.some((e) => /no válido/i.test(e))).toBe(true);
  });

  it("marca curso ya existente en el colegio", () => {
    const [f] = preparar(["5B;A"], new Set(["5BA"]));
    expect(f.datos).toBeNull();
    expect(f.errores.some((e) => /ya existe/i.test(e))).toBe(true);
  });
});

describe("resumen", () => {
  it("cuenta válidas e inválidas", () => {
    const filas = validarCursos(
      filasComoObjetos(parsearCsv("nivel;letra\n5B;A\n99;A")).registros,
      new Set()
    );
    expect(resumen(filas)).toEqual({ total: 2, validas: 1, invalidas: 1 });
  });
});
