import { describe, it, expect } from "vitest";
import { colorAsignatura, claveColorAsignatura, PALETA, CLAVES_COLOR } from "./colores-asignatura";

describe("colorAsignatura (convención)", () => {
  it("lenguaje es rojo (convención)", () => {
    expect(colorAsignatura("Lenguaje y Comunicación").punto).toBe("bg-red-500");
  });

  it("matemática es azul", () => {
    expect(colorAsignatura("Matemática").punto).toBe("bg-blue-500");
  });

  it("historia/sociales es ámbar", () => {
    expect(colorAsignatura("Historia y Cs. Sociales").punto).toBe("bg-amber-500");
    expect(colorAsignatura("Historia, Geografía y Cs. Sociales").punto).toBe("bg-amber-500");
  });

  it("artes/música es violeta", () => {
    expect(colorAsignatura("Artes Visuales").punto).toBe("bg-violet-500");
    expect(colorAsignatura("Música").punto).toBe("bg-violet-500");
  });

  it("es insensible a mayúsculas y da un color por defecto conocido", () => {
    expect(colorAsignatura("BIOLOGÍA").punto).toBe("bg-emerald-500");
    expect(colorAsignatura("Asignatura rara").punto).toBe("bg-marca-400");
  });
});

describe("colorAsignatura (configurable por colegio)", () => {
  it("una clave válida tiene prioridad sobre la convención", () => {
    // Lenguaje sería rojo por convención, pero el colegio lo configuró violeta.
    expect(colorAsignatura("Lenguaje y Comunicación", "violeta").punto).toBe("bg-violet-500");
  });

  it("una clave inválida o nula cae en la convención", () => {
    expect(colorAsignatura("Matemática", "inexistente").punto).toBe("bg-blue-500");
    expect(colorAsignatura("Matemática", null).punto).toBe("bg-blue-500");
    expect(colorAsignatura("Matemática", undefined).punto).toBe("bg-blue-500");
  });

  it("toda clave de la paleta resuelve a clases Tailwind literales", () => {
    for (const clave of CLAVES_COLOR) {
      const c = colorAsignatura("Asignatura rara", clave);
      expect(c.punto).toBe(PALETA[clave].color.punto);
      expect(c.punto.startsWith("bg-")).toBe(true);
    }
  });
});

describe("claveColorAsignatura", () => {
  it("devuelve la clave configurada si es válida", () => {
    expect(claveColorAsignatura("Matemática", "rosa")).toBe("rosa");
  });

  it("cae en la convención cuando no hay clave", () => {
    expect(claveColorAsignatura("Lenguaje")).toBe("rojo");
  });

  it("devuelve null si no hay convención ni clave", () => {
    expect(claveColorAsignatura("Asignatura rara")).toBeNull();
  });
});
