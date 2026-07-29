import { describe, it, expect, afterEach } from "vitest";
import { emailDisponible, plantillaAviso, escaparHtml } from "./email";

const backup = { ...process.env };
afterEach(() => {
  process.env.RESEND_API_KEY = backup.RESEND_API_KEY;
  process.env.EMAIL_FROM = backup.EMAIL_FROM;
});

describe("emailDisponible", () => {
  it("está desactivado de forma segura sin configuración", () => {
    delete process.env.RESEND_API_KEY;
    delete process.env.EMAIL_FROM;
    expect(emailDisponible()).toBe(false);
  });

  it("se activa cuando hay clave y remitente", () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.EMAIL_FROM = "Aulia <x@y.cl>";
    expect(emailDisponible()).toBe(true);
  });
});

describe("plantillaAviso (minimización, Ley 21.719)", () => {
  it("no filtra la nota ni datos sensibles del menor", () => {
    const html = plantillaAviso(
      "Nueva calificación de Martina",
      "Se registró una calificación en Lenguaje (Prueba de lectura).",
      "Colegio Demo"
    );
    // Invita a la plataforma, sin exponer la calificación por correo.
    expect(html).toContain("Ingresa a la plataforma");
    expect(html).not.toMatch(/\b[1-7]\.\d\b/); // ninguna nota 1.0–7.0
    expect(html).not.toMatch(/rut|diagn|salud/i);
  });

  it("escapa HTML para evitar inyección desde nombres editables", () => {
    expect(escaparHtml('<script>alert(1)</script>')).toBe(
      "&lt;script&gt;alert(1)&lt;/script&gt;"
    );
    const html = plantillaAviso("Nueva calificación de <b>x</b>", "d", "c");
    expect(html).not.toContain("<b>x</b>");
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
  });
});
