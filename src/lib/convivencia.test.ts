import { describe, it, expect } from "vitest";
import {
  esEquipoConvivencia,
  puedeConvivencia,
  crearCasoSchema,
  agregarSeguimientoSchema,
  cambiarEstadoSchema,
} from "./convivencia";

describe("acceso a convivencia", () => {
  it("el equipo (dirección/UTP/inspector/admin) ve todo", () => {
    for (const rol of ["ADMIN", "DIRECTOR", "UTP", "INSPECTOR"]) {
      expect(esEquipoConvivencia(rol)).toBe(true);
      expect(puedeConvivencia(rol)).toBe(true);
    }
  });
  it("profesor jefe accede pero no es equipo (limitado a su jefatura)", () => {
    expect(puedeConvivencia("PROFESOR_JEFE")).toBe(true);
    expect(esEquipoConvivencia("PROFESOR_JEFE")).toBe(false);
  });
  it("profesor de asignatura y apoderado quedan fuera", () => {
    expect(puedeConvivencia("PROFESOR")).toBe(false);
    expect(puedeConvivencia("APODERADO")).toBe(false);
  });
});

describe("schemas de convivencia", () => {
  it("crearCaso válido y rechazo de categoría inválida", () => {
    expect(
      crearCasoSchema.safeParse({
        estudianteId: "e",
        categoria: "Entrevista",
        titulo: "Entrevista inicial",
        descripcion: "Se cita al apoderado.",
      }).success
    ).toBe(true);
    expect(
      crearCasoSchema.safeParse({
        estudianteId: "e",
        categoria: "Inventada",
        titulo: "x",
        descripcion: "y",
      }).success
    ).toBe(false);
  });

  it("permite omitir el título y conserva la descripción obligatoria", () => {
    const sinTitulo = crearCasoSchema.safeParse({
      estudianteId: "e",
      categoria: "Acompañamiento",
      descripcion: "Seguimiento socioemocional solicitado por jefatura.",
    });
    expect(sinTitulo.success).toBe(true);
    if (sinTitulo.success) expect(sinTitulo.data.titulo).toBe("");

    expect(
      crearCasoSchema.safeParse({
        estudianteId: "e",
        categoria: "Acompañamiento",
        descripcion: "",
      }).success
    ).toBe(false);
  });

  it("agregarSeguimiento exige tipo válido y fecha", () => {
    expect(
      agregarSeguimientoSchema.safeParse({
        casoId: "c",
        tipo: "ENTREVISTA",
        texto: "Reunión con apoderado",
        fecha: "2026-05-10",
      }).success
    ).toBe(true);
    expect(
      agregarSeguimientoSchema.safeParse({
        casoId: "c",
        tipo: "OTRO",
        texto: "x",
        fecha: "2026-05-10",
      }).success
    ).toBe(false);
  });

  it("cambiarEstado solo acepta estados válidos", () => {
    expect(cambiarEstadoSchema.safeParse({ casoId: "c", estado: "CERRADO" }).success).toBe(true);
    expect(cambiarEstadoSchema.safeParse({ casoId: "c", estado: "PENDIENTE" }).success).toBe(false);
  });
});
