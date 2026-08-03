import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  claveDe,
  descripcionLote,
  listarPendientes,
  prefijoDe,
  rutaDe,
  type PayloadCola,
} from "./cola-asistencia";

/** localStorage de mentira: el módulo se usa en el navegador. */
function montarAlmacen(): Storage {
  const datos = new Map<string, string>();
  const fake = {
    get length() {
      return datos.size;
    },
    key: (i: number) => [...datos.keys()][i] ?? null,
    getItem: (k: string) => datos.get(k) ?? null,
    setItem: (k: string, v: string) => void datos.set(k, v),
    removeItem: (k: string) => void datos.delete(k),
    clear: () => datos.clear(),
  } as unknown as Storage;
  vi.stubGlobal("localStorage", fake);
  return fake;
}

const CTX = "colegio1:usuario1";

function lote(over: Partial<PayloadCola> = {}): PayloadCola {
  return {
    cursoId: "c1",
    fecha: "2026-08-03",
    marcas: [{ estudianteId: "e1", estado: "PRESENTE" }],
    clientMutationId: "m1",
    capturadaEn: "2026-08-03T12:00:00.000Z",
    versionBase: "v1",
    expiraEn: 2_000,
    ...over,
  };
}

describe("cola de asistencia sin conexión", () => {
  beforeEach(() => {
    montarAlmacen();
  });

  it("la clave no contiene nombres ni RUT, solo identificadores", () => {
    const k = claveDe(CTX, "c1", "b7", "2026-08-03");
    expect(k).toBe("aulia:asistencia:cola:colegio1:usuario1:c1:b7:2026-08-03");
    expect(k.startsWith(prefijoDe(CTX))).toBe(true);
  });

  it("distingue la lista diaria de la de un bloque", () => {
    expect(claveDe(CTX, "c1", undefined, "2026-08-03")).toContain(":diaria:");
    expect(claveDe(CTX, "c1", "b7", "2026-08-03")).toContain(":b7:");
  });

  it("un lote vencido se CONSERVA y se marca, nunca se borra solo", () => {
    const clave = claveDe(CTX, "c1", undefined, "2026-08-03");
    localStorage.setItem(clave, JSON.stringify(lote({ expiraEn: 1_000 })));

    const pendientes = listarPendientes(CTX, 5_000);

    expect(pendientes).toHaveLength(1);
    expect(pendientes[0].vencido).toBe(true);
    // Sigue en el almacén: la asistencia es registro legal, no se descarta sola.
    expect(localStorage.getItem(clave)).not.toBeNull();
  });

  it("un lote vigente no se marca como vencido", () => {
    localStorage.setItem(
      claveDe(CTX, "c1", undefined, "2026-08-03"),
      JSON.stringify(lote({ expiraEn: 9_000 }))
    );
    expect(listarPendientes(CTX, 5_000)[0].vencido).toBe(false);
  });

  it("no devuelve lotes de otra persona ni de otro colegio", () => {
    localStorage.setItem(claveDe(CTX, "c1", undefined, "2026-08-03"), JSON.stringify(lote()));
    localStorage.setItem(
      claveDe("colegio1:usuario2", "c1", undefined, "2026-08-03"),
      JSON.stringify(lote())
    );
    localStorage.setItem(
      claveDe("colegio2:usuario1", "c1", undefined, "2026-08-03"),
      JSON.stringify(lote())
    );

    expect(listarPendientes(CTX, 0)).toHaveLength(1);
  });

  it("descarta y limpia una entrada corrupta sin romperse", () => {
    const clave = claveDe(CTX, "c1", undefined, "2026-08-03");
    localStorage.setItem(clave, "{esto no es json");

    expect(listarPendientes(CTX, 0)).toHaveLength(0);
    expect(localStorage.getItem(clave)).toBeNull();
  });

  it("ordena del más antiguo al más nuevo: se recupera en el orden en que ocurrió", () => {
    localStorage.setItem(
      claveDe(CTX, "c2", undefined, "2026-08-04"),
      JSON.stringify(lote({ cursoId: "c2", capturadaEn: "2026-08-04T09:00:00.000Z" }))
    );
    localStorage.setItem(
      claveDe(CTX, "c1", undefined, "2026-08-03"),
      JSON.stringify(lote({ cursoId: "c1", capturadaEn: "2026-08-03T09:00:00.000Z" }))
    );

    expect(listarPendientes(CTX, 0).map((l) => l.payload.cursoId)).toEqual(["c1", "c2"]);
  });

  it("la ruta de vuelta reconstruye la página exacta del lote", () => {
    expect(rutaDe(lote({ bloqueHorarioId: "b7" }))).toBe(
      "/libro-clases/asistencia?cursoId=c1&fecha=2026-08-03&bloqueId=b7"
    );
    expect(rutaDe(lote())).toBe("/libro-clases/asistencia?cursoId=c1&fecha=2026-08-03");
  });

  it("la descripción es legible y no filtra identidades", () => {
    const texto = descripcionLote(lote({ bloqueHorarioId: "b7" }));
    expect(texto).toContain("03-08");
    expect(texto).toContain("1 estudiantes");
    expect(texto).not.toContain("e1");
  });
});
