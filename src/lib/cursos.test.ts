import { describe, expect, it } from "vitest";
import {
  compararCursos,
  nombreCurso,
  ordenDeNivel,
  ordenarCursos,
} from "./cursos";

describe("nombreCurso", () => {
  it("convierte los códigos internos en nombres escolares legibles", () => {
    expect(nombreCurso({ nivel: "1B", letra: "A" })).toBe("1° básico A");
    expect(nombreCurso({ nivel: "4M", letra: "B" })).toBe("IV medio B");
    expect(nombreCurso({ nivel: "NT2", letra: "A" })).toBe("NT2 · Kínder A");
  });
});

describe("orden pedagógico de los niveles", () => {
  it("ordena prebásica, luego básica, luego media", () => {
    const desordenados = [
      { nivel: "4M", letra: "A" },
      { nivel: "1B", letra: "A" },
      { nivel: "NT2", letra: "A" },
      { nivel: "8B", letra: "A" },
      { nivel: "1M", letra: "A" },
      { nivel: "NT1", letra: "A" },
      { nivel: "2B", letra: "A" },
    ];
    expect(ordenarCursos(desordenados).map((c) => c.nivel)).toEqual([
      "NT1", "NT2", "1B", "2B", "8B", "1M", "4M",
    ]);
  });

  it("corrige el caso real que producía el orden alfabético", () => {
    // Lo que mostraba la pantalla de asistencia con orderBy nivel asc.
    const comoVenianDeLaConsulta = [
      { nivel: "1B", letra: "A" },
      { nivel: "1M", letra: "A" },
      { nivel: "2M", letra: "A" },
      { nivel: "3B", letra: "A" },
      { nivel: "4M", letra: "A" },
      { nivel: "5B", letra: "A" },
      { nivel: "6B", letra: "A" },
      { nivel: "8B", letra: "A" },
    ];
    expect(ordenarCursos(comoVenianDeLaConsulta).map((c) => c.nivel)).toEqual([
      "1B", "3B", "5B", "6B", "8B", "1M", "2M", "4M",
    ]);
  });

  it("desempata por letra dentro del mismo nivel", () => {
    const cursos = [
      { nivel: "5B", letra: "C" },
      { nivel: "5B", letra: "A" },
      { nivel: "5B", letra: "B" },
    ];
    expect(ordenarCursos(cursos).map((c) => c.letra)).toEqual(["A", "B", "C"]);
  });

  it("manda los niveles desconocidos al final sin romper el resto", () => {
    const cursos = [
      { nivel: "ZZ", letra: "A" },
      { nivel: "3B", letra: "A" },
      { nivel: "NT1", letra: "A" },
    ];
    expect(ordenarCursos(cursos).map((c) => c.nivel)).toEqual(["NT1", "3B", "ZZ"]);
  });

  it("no muta la lista original", () => {
    const original = [{ nivel: "4M", letra: "A" }, { nivel: "1B", letra: "A" }];
    const copia = [...original];
    ordenarCursos(original);
    expect(original).toEqual(copia);
  });

  it("es insensible a mayúsculas y espacios en el código de nivel", () => {
    expect(ordenDeNivel(" 3b ")).toBe(ordenDeNivel("3B"));
  });

  it("compararCursos sirve directo en sort()", () => {
    expect(compararCursos({ nivel: "1M", letra: "A" }, { nivel: "8B", letra: "A" })).toBeGreaterThan(0);
    expect(compararCursos({ nivel: "NT1", letra: "A" }, { nivel: "1B", letra: "A" })).toBeLessThan(0);
  });
});
