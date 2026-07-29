import { describe, expect, it } from "vitest";
import {
  construirDiagnosticoCumplimiento,
  evaluarVerificacion,
  type FuenteDiagnosticoCumplimiento,
} from "./cumplimiento";

const AHORA = new Date("2026-07-21T15:00:00.000Z");

function fuente(
  parcial: Partial<FuenteDiagnosticoCumplimiento> = {},
): FuenteDiagnosticoCumplimiento {
  return {
    rbdPresente: false,
    exportaciones: [],
    auditoria: { total: 0, primeraEn: null, ultimaEn: null },
    libro: {
      clasesRegistradas: 0,
      clasesFirmadas: 0,
      firmasMineducVerificadas: 0,
    },
    verificaciones: {},
    privacidad: { solicitudesAbiertas: 0, solicitudesVencidas: 0 },
    ...parcial,
  };
}

describe("centro de cumplimiento", () => {
  it("mantiene pendientes los controles que no tienen evidencia", () => {
    const resultado = construirDiagnosticoCumplimiento(fuente(), AHORA);

    expect(resultado.evidencias.find((item) => item.clave === "EDE")?.estado).toBe(
      "pendiente",
    );
    expect(
      resultado.evidencias.find((item) => item.clave === "RESPALDOS")?.estado,
    ).toBe("pendiente");
    expect(resultado.checklist.find((item) => item.id === "rbd")?.completado).toBe(
      false,
    );
  });

  it("reconoce evidencia EDE solo si hay validación, cifrado, hash y artefacto", () => {
    const resultado = construirDiagnosticoCumplimiento(
      fuente({
        rbdPresente: true,
        exportaciones: [
          {
            id: "ede-1",
            anio: 2026,
            estado: "VALIDADA",
            creadaEn: AHORA,
            validadoEn: AHORA,
            versionEde: "interna-1",
            versionCeds: "x",
            cifrado: true,
            artefactos: 1,
            tamanoBytes: 100,
            tieneHash: true,
            tieneErrores: false,
          },
        ],
      }),
      AHORA,
    );

    const ede = resultado.evidencias.find((item) => item.clave === "EDE");
    expect(ede?.estado).toBe("listo");
    expect(ede?.etiqueta).toBe("Validación registrada");
    expect(ede?.evidencia).toContain("no acredita homologación");
    expect(resultado.checklist.find((item) => item.id === "ede")?.completado).toBe(
      true,
    );
  });

  it("no confunde una firma local con la verificación oficial Mineduc", () => {
    const resultado = construirDiagnosticoCumplimiento(
      fuente({
        libro: {
          clasesRegistradas: 20,
          clasesFirmadas: 18,
          firmasMineducVerificadas: 0,
        },
      }),
      AHORA,
    );

    const firma = resultado.evidencias.find((item) => item.clave === "FIRMA");
    expect(firma?.estado).toBe("atencion");
    expect(firma?.etiqueta).toBe("Solo firma local");
    expect(resultado.checklist.find((item) => item.id === "firma")?.completado).toBe(
      false,
    );
  });

  it("marca una verificación OK como desactualizada fuera de su ventana", () => {
    const haceTresDias = new Date(AHORA.getTime() - 72 * 60 * 60 * 1000);
    expect(
      evaluarVerificacion(
        { estado: "OK", ejecutadaEn: haceTresDias },
        AHORA,
        48,
      ),
    ).toBe("atencion");
  });

  it("prioriza solicitudes de privacidad vencidas sin exponer titulares", () => {
    const resultado = construirDiagnosticoCumplimiento(
      fuente({
        privacidad: { solicitudesAbiertas: 3, solicitudesVencidas: 1 },
      }),
      AHORA,
    );

    const privacidad = resultado.evidencias.find(
      (item) => item.clave === "PRIVACIDAD",
    );
    expect(privacidad?.estado).toBe("atencion");
    expect(privacidad?.evidencia.toLowerCase()).toContain("vista agregada");
    expect(privacidad?.evidencia).not.toMatch(/\d{7,8}-[\dkK]/);
    expect(
      resultado.checklist.find((item) => item.id === "privacidad")?.prioridad,
    ).toBe("alta");
  });
});
