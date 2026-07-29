import { describe, expect, it } from "vitest";
import { whereCursosVisibles, whereEstudiantesVisibles } from "./alcance-estudiantes";

describe("alcance horizontal de estudiantes", () => {
  it("gestión conserva acceso escolar acotado al tenant", () => {
    expect(whereEstudiantesVisibles({ id: "dir_1", rol: "DIRECTOR", colegioId: "col_1" })).toEqual({ colegioId: "col_1" });
  });

  it("un profesor solo alcanza su jefatura o cursos donde dicta", () => {
    const actor = { id: "doc_1", rol: "PROFESOR", colegioId: "col_1" };
    expect(whereCursosVisibles(actor)).toEqual({
      colegioId: "col_1",
      OR: [
        { profesorJefeId: "doc_1" },
        { asignaturas: { some: { colegioId: "col_1", docenteId: "doc_1" } } },
      ],
    });
    expect(whereEstudiantesVisibles(actor)).toEqual(expect.objectContaining({
      colegioId: "col_1",
      matriculas: { some: expect.objectContaining({ colegioId: "col_1", estado: "ACTIVA" }) },
    }));
  });
});
