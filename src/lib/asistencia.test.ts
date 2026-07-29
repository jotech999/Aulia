import { describe, expect, it } from "vitest";
import {
  autorizarRegistroAsistencia,
  calcularResumen,
  cuentaComoPresente,
  guardarAsistenciaBloqueSchema,
  guardarAsistenciaSchema,
} from "./asistencia";

describe("cuentaComoPresente", () => {
  it("presente, atrasado y retirado cuentan como asistido; ausente no (regla SIGE)", () => {
    expect(cuentaComoPresente("PRESENTE")).toBe(true);
    expect(cuentaComoPresente("ATRASADO")).toBe(true);
    expect(cuentaComoPresente("RETIRADO")).toBe(true);
    expect(cuentaComoPresente("AUSENTE")).toBe(false);
  });
});

describe("guardarAsistenciaBloqueSchema", () => {
  it("exige una clase del horario y conserva ambas versiones de concurrencia", () => {
    const resultado = guardarAsistenciaBloqueSchema.safeParse({
      cursoId: "curso_1",
      bloqueHorarioId: "bloque_2",
      fecha: "2026-07-22",
      marcas: [{ estudianteId: "est_1", estado: "PRESENTE" }],
      versionBase: new Date(0).toISOString(),
      versionDiariaBase: new Date(0).toISOString(),
    });
    expect(resultado.success).toBe(true);

    expect(
      guardarAsistenciaBloqueSchema.safeParse({
        cursoId: "curso_1",
        fecha: "2026-07-22",
        marcas: [{ estudianteId: "est_1", estado: "PRESENTE" }],
        versionBase: new Date(0).toISOString(),
      }).success
    ).toBe(false);
  });
});

describe("calcularResumen", () => {
  it("calcula % sobre días con registro (denominador = días de clase)", () => {
    const r = calcularResumen([
      "PRESENTE",
      "PRESENTE",
      "ATRASADO",
      "RETIRADO",
      "AUSENTE",
    ]);
    expect(r.diasConRegistro).toBe(5);
    expect(r.presentes).toBe(4);
    expect(r.ausentes).toBe(1);
    expect(r.porcentaje).toBe(80);
  });

  it("redondea a un decimal", () => {
    // 2 de 3 asistidos = 66.66… → 66.7
    expect(calcularResumen(["PRESENTE", "PRESENTE", "AUSENTE"]).porcentaje).toBe(
      66.7
    );
  });

  it("sin registros: porcentaje null (no cuenta días teóricos)", () => {
    const r = calcularResumen([]);
    expect(r.diasConRegistro).toBe(0);
    expect(r.porcentaje).toBeNull();
  });
});

describe("autorizarRegistroAsistencia", () => {
  const curso = { profesorJefeId: "u-jefe", docenteIds: ["u-mate", "u-leng"] };

  it("caso feliz: el profesor jefe puede registrar su curso", () => {
    expect(autorizarRegistroAsistencia("PROFESOR_JEFE", "u-jefe", curso)).toBe(
      true
    );
  });

  it("caso feliz: un profesor de asignatura del curso puede registrar", () => {
    expect(autorizarRegistroAsistencia("PROFESOR", "u-mate", curso)).toBe(true);
  });

  it("roles de gestión (director/utp/inspector/admin) pueden registrar", () => {
    for (const rol of ["ADMIN", "DIRECTOR", "UTP", "INSPECTOR"]) {
      expect(autorizarRegistroAsistencia(rol, "cualquiera", curso)).toBe(true);
    }
  });

  it("permiso denegado: el apoderado NUNCA puede registrar asistencia", () => {
    expect(autorizarRegistroAsistencia("APODERADO", "u-jefe", curso)).toBe(
      false
    );
  });

  it("permiso denegado: un profesor ajeno al curso no puede registrar", () => {
    expect(autorizarRegistroAsistencia("PROFESOR", "u-extraño", curso)).toBe(
      false
    );
  });

  it("permiso denegado: profesor jefe de OTRO curso no puede registrar este", () => {
    expect(
      autorizarRegistroAsistencia("PROFESOR_JEFE", "u-otro-jefe", curso)
    ).toBe(false);
  });
});

describe("guardarAsistenciaSchema", () => {
  it("acepta una entrada válida", () => {
    const r = guardarAsistenciaSchema.safeParse({
      cursoId: "c1",
      fecha: "2026-07-08",
      marcas: [{ estudianteId: "e1", estado: "AUSENTE" }],
      versionBase: new Date(0).toISOString(),
    });
    expect(r.success).toBe(true);
  });

  it("rechaza fecha con formato inválido", () => {
    const r = guardarAsistenciaSchema.safeParse({
      cursoId: "c1",
      fecha: "08/07/2026",
      marcas: [{ estudianteId: "e1", estado: "AUSENTE" }],
    });
    expect(r.success).toBe(false);
  });

  it("rechaza un día inexistente aunque cumpla el formato (evita rollover)", () => {
    const r = guardarAsistenciaSchema.safeParse({
      cursoId: "c1",
      fecha: "2026-02-30",
      marcas: [{ estudianteId: "e1", estado: "AUSENTE" }],
    });
    expect(r.success).toBe(false);
  });

  it("rechaza un estado no permitido", () => {
    const r = guardarAsistenciaSchema.safeParse({
      cursoId: "c1",
      fecha: "2026-07-08",
      marcas: [{ estudianteId: "e1", estado: "JUSTIFICADO" }],
    });
    expect(r.success).toBe(false);
  });

  it("rechaza lista de marcas vacía", () => {
    const r = guardarAsistenciaSchema.safeParse({
      cursoId: "c1",
      fecha: "2026-07-08",
      marcas: [],
    });
    expect(r.success).toBe(false);
  });
});
