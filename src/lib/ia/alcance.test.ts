import { describe, it, expect } from "vitest";
import {
  alcanceEstudiantes,
  alcanceCursosRiesgo,
  type UsuarioIA,
} from "./alcance";

const colegioId = "col_1";

describe("alcanceEstudiantes (reautorización del asistente)", () => {
  it("gestión ve todo el colegio, sin filtros de pertenencia", () => {
    for (const rol of ["ADMIN", "DIRECTOR", "UTP", "INSPECTOR"]) {
      const w = alcanceEstudiantes({ id: "u", rol, colegioId });
      expect(w).toEqual({ colegioId });
    }
  });

  it("el apoderado queda restringido a sus pupilos (multi-tenant + pertenencia)", () => {
    const user: UsuarioIA = { id: "apo_1", rol: "APODERADO", colegioId };
    const w = alcanceEstudiantes(user);
    expect(w.colegioId).toBe(colegioId);
    // Debe exigir un vínculo de apoderado con el usuario en sesión.
    expect(w.apoderados).toEqual({ some: { usuarioId: "apo_1" } });
    // Nunca debe abrir a todo el colegio.
    expect(w).not.toEqual({ colegioId });
  });

  it("el profesor solo ve estudiantes de sus cursos", () => {
    const user: UsuarioIA = { id: "prof_1", rol: "PROFESOR", colegioId };
    const w = alcanceEstudiantes(user);
    expect(w.colegioId).toBe(colegioId);
    expect(w.matriculas).toBeDefined();
  });
});

describe("alcanceCursosRiesgo (perfil de riesgo integral)", () => {
  it("el apoderado NO accede al panel de riesgo por IA", () => {
    expect(alcanceCursosRiesgo({ id: "apo", rol: "APODERADO", colegioId })).toBeNull();
  });

  it("el profesor de asignatura queda acotado a su jefatura", () => {
    const w = alcanceCursosRiesgo({ id: "prof", rol: "PROFESOR", colegioId });
    expect(w).toEqual({ colegioId, profesorJefeId: "prof" });
  });

  it("la gestión ve el riesgo de todo el colegio", () => {
    expect(alcanceCursosRiesgo({ id: "d", rol: "DIRECTOR", colegioId })).toEqual({ colegioId });
  });
});
