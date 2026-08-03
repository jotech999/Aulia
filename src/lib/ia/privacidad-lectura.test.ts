import { describe, expect, it } from "vitest";
import { quitarIdentidades } from "./papel";
import { despersonalizar } from "./pie";

/**
 * Estos filtros son la ÚLTIMA barrera antes de que un texto salga del colegio
 * hacia un servicio de IA externo. Al modelo ya se le pide no transcribir
 * identidades, pero un modelo puede desobedecer y una foto de una prueba trae
 * el nombre escrito en el encabezado. Cada caso de aquí es un dato personal que
 * no debe filtrarse.
 */

describe("quitarIdentidades — transcripción de una hoja fotografiada", () => {
  it("elimina el encabezado con el nombre del estudiante", () => {
    const { limpio, huboRecorte } = quitarIdentidades(
      ["Nombre: Martina Fuentes Rojas", "1: b", "2: V"].join("\n")
    );
    expect(limpio).toBe("1: b\n2: V");
    expect(huboRecorte).toBe(true);
  });

  it("elimina la línea del RUT en cualquiera de sus formatos", () => {
    for (const linea of ["RUT: 21.345.678-9", "21345678-9", "Rut 21.345.678 - K"]) {
      const { limpio } = quitarIdentidades([linea, "1: a"].join("\n"));
      expect(limpio).toBe("1: a");
    }
  });

  it("elimina variantes del encabezado que usan los colegios", () => {
    const texto = [
      "Alumno: Pedro Soto",
      "Estudiante: Ana Pérez",
      "Apellidos: Muñoz Vera",
      "1: 24",
    ].join("\n");
    expect(quitarIdentidades(texto).limpio).toBe("1: 24");
  });

  it("no recorta respuestas que hablan de personas en su contenido", () => {
    // "el nombre del río" NO es un encabezado: la regla ancla al inicio de línea.
    const texto = "1: el nombre del río es Biobío\n2: Ana fue la protagonista";
    const { limpio, huboRecorte } = quitarIdentidades(texto);
    expect(limpio).toBe(texto);
    expect(huboRecorte).toBe(false);
  });

  it("conserva las marcas de ilegible para que la persona las complete", () => {
    const { limpio } = quitarIdentidades("1: [ilegible]\n2: falso");
    expect(limpio).toContain("[ilegible]");
  });

  it("si TODO era identidad, devuelve vacío en vez de dejar pasar algo", () => {
    expect(quitarIdentidades("Nombre: X\nRUT: 11.111.111-1").limpio).toBe("");
  });
});

describe("despersonalizar — texto clínico del módulo PIE", () => {
  it("quita el encabezado con nombre y la fecha de nacimiento", () => {
    const texto = [
      "Nombre: Benjamín Araya",
      "Fecha de nacimiento: 12-03-2014",
      "Requiere apoyo para mantener la atención en tareas largas.",
    ].join("\n");
    expect(despersonalizar(texto)).toBe(
      "Requiere apoyo para mantener la atención en tareas largas."
    );
  });

  it("enmascara un RUT escrito en medio de una frase, sin borrar la frase", () => {
    const texto = "El informe externo (RUT 21.345.678-9) sugiere apoyo en lectura.";
    const salida = despersonalizar(texto);
    expect(salida).toContain("[RUT omitido]");
    expect(salida).toContain("sugiere apoyo en lectura");
    expect(salida).not.toContain("21.345.678-9");
  });

  it("conserva íntegra la descripción pedagógica, que es lo que se necesita", () => {
    const texto =
      "Comprende mejor con apoyo visual.\nSe desregula con los cambios de rutina no avisados.";
    expect(despersonalizar(texto)).toBe(texto);
  });
});
