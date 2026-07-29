import { describe, it, expect, beforeAll } from "vitest";
import { cifrar, descifrar, cifradoDisponible, descifrarSeguro } from "./cifrado";

beforeAll(() => {
  // Clave de prueba (32 bytes en hex).
  process.env.PIE_ENCRYPTION_KEY = "a".repeat(64);
});

describe("cifrado AES-256-GCM (diagnóstico PIE)", () => {
  it("ida y vuelta: descifrar(cifrar(x)) === x", () => {
    const secreto = "Diagnóstico: TEA nivel 1, requiere apoyo en aula.";
    const payload = cifrar(secreto);
    expect(payload).not.toContain(secreto); // en la BD nunca va en claro
    expect(payload.split(".")).toHaveLength(3); // iv.tag.ct
    expect(descifrar(payload)).toBe(secreto);
  });

  it("cada cifrado usa IV distinto (no determinista)", () => {
    expect(cifrar("x")).not.toBe(cifrar("x"));
  });

  it("descifrarSeguro no revienta con payload corrupto", () => {
    expect(descifrarSeguro("basura")).toBe("[no disponible]");
  });

  it("está disponible con clave válida", () => {
    expect(cifradoDisponible()).toBe(true);
  });
});
