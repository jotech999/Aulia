import { afterEach, describe, expect, it } from "vitest";
import { cifrarDetalleJustificacion, descifrarDetalleJustificacion } from "./cifrado-justificacion";

afterEach(() => delete process.env.DATOS_SENSIBLES_KEY);

describe("cifrado de detalle de justificación", () => {
  it("usa AES-GCM y no conserva el texto en claro", () => {
    process.env.DATOS_SENSIBLES_KEY = "clave-de-prueba-no-productiva";
    const cifrado = cifrarDetalleJustificacion("Antecedente administrativo");
    expect(cifrado).not.toContain("Antecedente administrativo");
    expect(descifrarDetalleJustificacion(cifrado)).toBe("Antecedente administrativo");
  });

  it("no devuelve texto legado sin cifrar", () => {
    process.env.DATOS_SENSIBLES_KEY = "clave-de-prueba-no-productiva";
    expect(descifrarDetalleJustificacion("diagnóstico en claro")).toBeNull();
  });
});
